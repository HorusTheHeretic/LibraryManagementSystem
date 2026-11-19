namespace LibraryManagement.Controllers;

[Authorize]
public class BooksController(AppDbContext db) : Controller
{
    public async Task<IActionResult> Index(string? q, string? category)
    {
        var query = db.Books.AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(b => b.Title.Contains(q) || b.Author.Contains(q) || b.Isbn.Contains(q));
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(b => b.Category == category);
        ViewBag.Categories = await db.Books.Select(b => b.Category).Distinct().OrderBy(c => c).ToListAsync();
        ViewBag.Q = q; ViewBag.Category = category;
        return View(await query.OrderBy(b => b.Title).ToListAsync());
    }

    [Authorize(Roles = "Admin")] public IActionResult Create() => View(new Book());

    [HttpPost, Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(Book b)
    {
        if (await db.Books.AnyAsync(x => x.Isbn == b.Isbn))
            ModelState.AddModelError(nameof(b.Isbn), "A book with this ISBN is already registered.");
        if (!ModelState.IsValid) return View(b);
        b.AvailableCopies = b.TotalCopies;
        db.Books.Add(b);
        await db.SaveChangesAsync();
        TempData["Msg"] = $"'{b.Title}' added.";
        return RedirectToAction(nameof(Index));
    }

    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Edit(int id) =>
        await db.Books.FindAsync(id) is { } book ? (IActionResult)View(book) : NotFound();

    [HttpPost, Authorize(Roles = "Admin")]
    public async Task<IActionResult> Edit(int id, Book input)
    {
        var book = await db.Books.FindAsync(id);
        if (book is null) return NotFound();
        if (await db.Books.AnyAsync(x => x.Isbn == input.Isbn && x.Id != id))
            ModelState.AddModelError(nameof(input.Isbn), "Another book already uses this ISBN.");
        var newAvailable = book.AvailableCopies + (input.TotalCopies - book.TotalCopies);
        if (newAvailable < 0)
            ModelState.AddModelError(nameof(input.TotalCopies), "Cannot go below the number of copies currently on loan.");
        if (!ModelState.IsValid) return View(input);

        book.Title = input.Title; book.Author = input.Author; book.Isbn = input.Isbn;
        book.Category = input.Category; book.ShelfLocation = input.ShelfLocation;
        book.TotalCopies = input.TotalCopies; book.AvailableCopies = newAvailable;
        await db.SaveChangesAsync();
        TempData["Msg"] = "Book updated.";
        return RedirectToAction(nameof(Index));
    }

    [HttpPost, Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id)
    {
        if (await db.Loans.AnyAsync(l => l.BookId == id))
            TempData["Err"] = "This book has loan history and cannot be deleted.";
        else if (await db.Books.FindAsync(id) is { } book)
        {
            db.Books.Remove(book);
            await db.SaveChangesAsync();
            TempData["Msg"] = "Book deleted.";
        }
        return RedirectToAction(nameof(Index));
    }
}
