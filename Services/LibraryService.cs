namespace LibraryManagement.Services;

/// <summary>Borrowing rules, penalty calculation and the issue/return workflow.</summary>
public class LibraryService(AppDbContext db, IConfiguration cfg)
{
    public decimal FinePerDay => cfg.GetValue("Library:FinePerDay", 5m);

    // Borrowing rules (students are the borrowers; Staff/Admin run the circulation desk)
    public const int MaxBooks = 3;
    public const int LoanDays = 14;

    public decimal Fine(Loan l) => l.OverdueDays * FinePerDay;

    public async Task<(bool Ok, string Message)> IssueAsync(int bookId, int userId)
    {
        var user = await db.Users.FindAsync(userId);
        var book = await db.Books.FindAsync(bookId);
        if (user is null || book is null) return (false, "Member or book not found.");
        if (user.Role != Role.Student) return (false, "Only student accounts can borrow books.");
        if (book.AvailableCopies < 1) return (false, $"No copies of '{book.Title}' are available.");

        var active = await db.Loans.Where(l => l.UserId == userId && l.ReturnedOn == null).ToListAsync();
        if (active.Any(l => l.OverdueDays > 0))
            return (false, "Borrowing restricted: the member has overdue books.");
        if (await db.Loans.AnyAsync(l => l.UserId == userId && l.ReturnedOn != null && l.FineAmount > 0 && !l.FinePaid))
            return (false, "Borrowing restricted: the member has unpaid fines.");
        if (active.Count >= MaxBooks)
            return (false, $"Limit reached: students may borrow up to {MaxBooks} books at a time.");
        if (active.Any(l => l.BookId == bookId))
            return (false, "The member already has a copy of this book.");

        var due = DateTime.Today.AddDays(LoanDays);
        db.Loans.Add(new Loan { BookId = bookId, UserId = userId, IssuedOn = DateTime.Now, DueOn = due });
        book.AvailableCopies--;
        await db.SaveChangesAsync();
        return (true, $"Issued '{book.Title}' to {user.FullName}. Due {due:MMM d, yyyy}.");
    }

    public async Task<(bool Ok, string Message)> ReturnAsync(int loanId)
    {
        var loan = await db.Loans.Include(l => l.Book).FirstOrDefaultAsync(l => l.Id == loanId);
        if (loan is null || loan.ReturnedOn != null) return (false, "Loan not found or already returned.");

        loan.ReturnedOn = DateTime.Now;          // set first: OverdueDays depends on it
        loan.FineAmount = Fine(loan);
        loan.FinePaid = loan.FineAmount == 0;
        loan.Book.AvailableCopies++;
        await db.SaveChangesAsync();
        return (true, loan.FineAmount > 0
            ? $"Returned {loan.OverdueDays} day(s) late. Fine: ₱{loan.FineAmount:N2}."
            : "Returned on time. No fine.");
    }

    public async Task<bool> PayFineAsync(int loanId)
    {
        var loan = await db.Loans.FindAsync(loanId);
        if (loan is null || loan.ReturnedOn is null || loan.FineAmount <= 0) return false;
        loan.FinePaid = true;
        await db.SaveChangesAsync();
        return true;
    }
}
