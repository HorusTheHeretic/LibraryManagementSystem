namespace LibraryManagement.Data;

public static class DbSeeder
{
    public static void Seed(AppDbContext db)
    {
        if (db.Users.Any()) return;
        db.Users.AddRange(
            new AppUser { FullName = "Head Librarian", Email = "admin@library.local", PasswordHash = Passwords.Hash("Admin@123"), Role = Role.Admin },
            new AppUser { FullName = "Sam Staff", Email = "staff@library.local", PasswordHash = Passwords.Hash("Staff@123"), Role = Role.Staff },
            new AppUser { FullName = "Stella Student", Email = "student@library.local", PasswordHash = Passwords.Hash("Student@123"), Role = Role.Student });
        db.Books.AddRange(
            B("Clean Code", "Robert C. Martin", "978-0132350884", "Programming", "A-01", 3),
            B("The Pragmatic Programmer", "Andrew Hunt", "978-0135957059", "Programming", "A-02", 2),
            B("Introduction to Algorithms", "Thomas H. Cormen", "978-0262046305", "Computer Science", "B-01", 2),
            B("A Brief History of Time", "Stephen Hawking", "978-0553380163", "Science", "C-04", 1),
            B("Noli Me Tangere", "Jose Rizal", "978-9712714979", "Literature", "D-10", 4),
            B("Database System Concepts", "Abraham Silberschatz", "978-0078022159", "Computer Science", "B-03", 2));
        db.SaveChanges();
    }

    static Book B(string t, string a, string i, string c, string s, int n) =>
        new() { Title = t, Author = a, Isbn = i, Category = c, ShelfLocation = s, TotalCopies = n, AvailableCopies = n };
}
