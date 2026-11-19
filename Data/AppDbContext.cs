namespace LibraryManagement.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Loan> Loans => Set<Loan>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppUser>().HasIndex(u => u.Email).IsUnique();
        b.Entity<Book>().HasIndex(x => x.Isbn).IsUnique();
        b.Entity<Loan>().Property(l => l.FineAmount).HasPrecision(10, 2);
        b.Entity<Loan>().HasOne(l => l.Book).WithMany(x => x.Loans).HasForeignKey(l => l.BookId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Loan>().HasOne(l => l.User).WithMany(u => u.Loans).HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
