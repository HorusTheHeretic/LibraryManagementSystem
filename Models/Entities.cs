using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace LibraryManagement.Models;

public enum Role { Student, Staff, Admin }   // Admin = librarian

public class AppUser
{
    public int Id { get; set; }
    [Required, StringLength(100)] public string FullName { get; set; } = "";
    [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public Role Role { get; set; }
    public List<Loan> Loans { get; set; } = new();
}

public class Book
{
    public int Id { get; set; }
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [Required, StringLength(150)] public string Author { get; set; } = "";
    [Required, StringLength(17), RegularExpression(@"^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?\D*$)[\d-]+$",
        ErrorMessage = "ISBN must contain 10 or 13 digits (hyphens allowed).")]
    public string Isbn { get; set; } = "";
    [Required, StringLength(80)] public string Category { get; set; } = "";
    [Required, StringLength(50), Display(Name = "Shelf location")] public string ShelfLocation { get; set; } = "";
    [Range(1, 1000), Display(Name = "Total copies")] public int TotalCopies { get; set; } = 1;
    public int AvailableCopies { get; set; }
    [ValidateNever] public List<Loan> Loans { get; set; } = new();
}

// Join entity: Book <-> AppUser is many-to-many, carrying issue/return/fine data
public class Loan
{
    public int Id { get; set; }
    public int BookId { get; set; }
    public Book Book { get; set; } = null!;
    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public DateTime IssuedOn { get; set; }
    public DateTime DueOn { get; set; }
    public DateTime? ReturnedOn { get; set; }
    public decimal FineAmount { get; set; }   // fixed at return time
    public bool FinePaid { get; set; }

    [NotMapped]
    public int OverdueDays => Math.Max(0, ((ReturnedOn ?? DateTime.Now).Date - DueOn.Date).Days);
}
