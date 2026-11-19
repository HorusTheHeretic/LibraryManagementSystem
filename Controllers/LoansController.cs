using Microsoft.AspNetCore.Mvc.Rendering;

namespace LibraryManagement.Controllers;

[Authorize]
public class LoansController(AppDbContext db, LibraryService lib) : Controller
{
    // Admin and Staff see every loan; students see only their own
    public async Task<IActionResult> Index(string? status)
    {
        var q = db.Loans.Include(l => l.Book).Include(l => l.User).AsQueryable();
        if (!User.IsInRole("Admin") && !User.IsInRole("Staff"))
        {
            var uid = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            q = q.Where(l => l.UserId == uid);
        }
        var list = await q.OrderByDescending(l => l.IssuedOn).ToListAsync();
        if (status == "active") list = list.Where(l => l.ReturnedOn == null).ToList();
        else if (status == "overdue") list = list.Where(l => l.ReturnedOn == null && l.OverdueDays > 0).ToList();
        ViewBag.Status = status;
        return View(list);
    }

    [Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> Issue() { await LoadListsAsync(); return View(new IssueVm()); }

    [HttpPost, Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> Issue(IssueVm vm)
    {
        if (ModelState.IsValid)
        {
            var (ok, msg) = await lib.IssueAsync(vm.BookId, vm.UserId);
            if (ok) { TempData["Msg"] = msg; return RedirectToAction(nameof(Index)); }
            ModelState.AddModelError("", msg);
        }
        await LoadListsAsync();
        return View(vm);
    }

    [HttpPost, Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> Return(int id)
    {
        var (ok, msg) = await lib.ReturnAsync(id);
        TempData[ok ? "Msg" : "Err"] = msg;
        return RedirectToAction(nameof(Index));
    }

    [HttpPost, Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> PayFine(int id)
    {
        if (await lib.PayFineAsync(id)) TempData["Msg"] = "Fine marked as paid.";
        else TempData["Err"] = "No unpaid fine found for this loan.";
        return RedirectToAction(nameof(Index));
    }

    private async Task LoadListsAsync()
    {
        var users = (await db.Users.Where(u => u.Role == Role.Student).OrderBy(u => u.FullName).ToListAsync())
            .Select(u => new { u.Id, Label = $"{u.FullName} ({u.Role})" });
        var books = (await db.Books.Where(b => b.AvailableCopies > 0).OrderBy(b => b.Title).ToListAsync())
            .Select(b => new { b.Id, Label = $"{b.Title} — {b.Author} [{b.AvailableCopies} avail.]" });
        ViewBag.Users = new SelectList(users, "Id", "Label");
        ViewBag.Books = new SelectList(books, "Id", "Label");
    }
}
