namespace LibraryManagement.Controllers;

// Authorization is per action: Staff may view the member list, everything else is Admin-only.
public class AdminController(AppDbContext db, LibraryService lib) : Controller
{
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Index()
    {
        var active = await db.Loans.Include(l => l.Book).Include(l => l.User).Where(l => l.ReturnedOn == null).ToListAsync();
        var overdue = active.Where(l => l.OverdueDays > 0).OrderByDescending(l => l.OverdueDays).ToList();
        var vm = new DashboardVm
        {
            Titles = await db.Books.CountAsync(),
            Copies = await db.Books.SumAsync(b => b.TotalCopies),
            Available = await db.Books.SumAsync(b => b.AvailableCopies),
            Members = await db.Users.CountAsync(u => u.Role == Role.Student),
            ActiveLoans = active.Count,
            Overdue = overdue,
            FinesCollected = await db.Loans.Where(l => l.FinePaid && l.FineAmount > 0).SumAsync(l => l.FineAmount),
            FinesOutstanding = await db.Loans.Where(l => l.ReturnedOn != null && !l.FinePaid).SumAsync(l => l.FineAmount)
                               + overdue.Sum(l => lib.Fine(l))
        };
        return View(vm);
    }

    [Authorize(Roles = "Admin,Staff")]
    public async Task<IActionResult> Users() =>
        View(await db.Users.Include(u => u.Loans).OrderBy(u => u.Role).ThenBy(u => u.FullName).ToListAsync());

    [Authorize(Roles = "Admin")]
    public IActionResult CreateUser() => View(new UserVm());

    [HttpPost, Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateUser(UserVm vm)
    {
        var email = vm.Email.Trim().ToLower();
        if (await db.Users.AnyAsync(u => u.Email == email))
            ModelState.AddModelError(nameof(vm.Email), "This email is already registered.");
        if (!ModelState.IsValid) return View(vm);
        db.Users.Add(new AppUser { FullName = vm.FullName.Trim(), Email = email, PasswordHash = Passwords.Hash(vm.Password), Role = vm.Role });
        await db.SaveChangesAsync();
        TempData["Msg"] = "Account created.";
        return RedirectToAction(nameof(Users));
    }

    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Report(DateTime? start, DateTime? end)
    {
        var (s, e) = Range(start, end);
        var loans = await db.Loans.Include(l => l.Book).Include(l => l.User)
            .Where(l => l.IssuedOn >= s && l.IssuedOn < e.AddDays(1))
            .OrderByDescending(l => l.IssuedOn).ToListAsync();
        ViewBag.Start = s; ViewBag.End = e;
        return View(loans);
    }

    // type: loans (date range) | overdue | fines | inventory
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ExportCsv(string type, DateTime? start, DateTime? end)
    {
        var (s, e) = Range(start, end);
        IQueryable<Loan> Loans() => db.Loans.Include(l => l.Book).Include(l => l.User);
        decimal FineOf(Loan l) => l.ReturnedOn == null ? lib.Fine(l) : l.FineAmount;
        string StatusOf(Loan l) => l.ReturnedOn != null ? "Returned" : l.OverdueDays > 0 ? "Overdue" : "Active";

        string[] headers; IEnumerable<object?[]> rows; string name;
        switch (type)
        {
            case "loans":
                var list = await Loans().Where(l => l.IssuedOn >= s && l.IssuedOn < e.AddDays(1)).OrderBy(l => l.IssuedOn).ToListAsync();
                headers = ["Issued", "Due", "Returned", "Book", "ISBN", "Member", "Email", "Status", "Days overdue", "Fine", "Fine paid"];
                rows = list.Select(l => new object?[] { l.IssuedOn, l.DueOn, l.ReturnedOn, l.Book.Title, l.Book.Isbn, l.User.FullName,
                    l.User.Email, StatusOf(l), l.OverdueDays, FineOf(l), FineOf(l) > 0 ? l.FinePaid : null });
                name = $"loans_{s:yyyyMMdd}_{e:yyyyMMdd}.csv";
                break;
            case "overdue":
                var od = (await Loans().Where(l => l.ReturnedOn == null).ToListAsync()).Where(l => l.OverdueDays > 0).OrderByDescending(l => l.OverdueDays);
                headers = ["Book", "ISBN", "Member", "Email", "Due", "Days late", "Accrued fine"];
                rows = od.Select(l => new object?[] { l.Book.Title, l.Book.Isbn, l.User.FullName, l.User.Email, l.DueOn, l.OverdueDays, FineOf(l) });
                name = $"overdue_{DateTime.Today:yyyyMMdd}.csv";
                break;
            case "fines":
                var fl = (await Loans().Where(l => l.ReturnedOn == null || l.FineAmount > 0).ToListAsync()).Where(l => FineOf(l) > 0).OrderBy(l => l.DueOn);
                headers = ["Member", "Email", "Book", "Due", "Returned", "Days overdue", "Fine", "Paid"];
                rows = fl.Select(l => new object?[] { l.User.FullName, l.User.Email, l.Book.Title, l.DueOn, l.ReturnedOn, l.OverdueDays, FineOf(l), l.FinePaid });
                name = $"fines_{DateTime.Today:yyyyMMdd}.csv";
                break;
            case "inventory":
                var books = await db.Books.OrderBy(b => b.Title).ToListAsync();
                headers = ["Title", "Author", "ISBN", "Category", "Shelf", "Total copies", "Available", "On loan"];
                rows = books.Select(b => new object?[] { b.Title, b.Author, b.Isbn, b.Category, b.ShelfLocation, b.TotalCopies, b.AvailableCopies, b.TotalCopies - b.AvailableCopies });
                name = $"inventory_{DateTime.Today:yyyyMMdd}.csv";
                break;
            default:
                return NotFound();
        }
        return File(Csv.Build(headers, rows), "text/csv", name);
    }

    private static (DateTime Start, DateTime End) Range(DateTime? start, DateTime? end) =>
        ((start ?? DateTime.Today.AddDays(-30)).Date, (end ?? DateTime.Today).Date);
}
