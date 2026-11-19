using System.ComponentModel.DataAnnotations;

namespace LibraryManagement.Models;

public class LoginVm
{
    [Required, EmailAddress] public string Email { get; set; } = "";
    [Required, DataType(DataType.Password)] public string Password { get; set; } = "";
}

public class RegisterVm
{
    [Required, StringLength(100), Display(Name = "Full name")] public string FullName { get; set; } = "";
    [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = "";
    [Required, StringLength(100, MinimumLength = 6), DataType(DataType.Password)] public string Password { get; set; } = "";
    [Required, Compare(nameof(Password)), DataType(DataType.Password), Display(Name = "Confirm password")]
    public string ConfirmPassword { get; set; } = "";
}

public class UserVm : RegisterVm { public Role Role { get; set; } = Role.Student; }

public class IssueVm
{
    [Range(1, int.MaxValue, ErrorMessage = "Select a member.")] public int UserId { get; set; }
    [Range(1, int.MaxValue, ErrorMessage = "Select a book.")] public int BookId { get; set; }
}

public class DashboardVm
{
    public int Titles, Copies, Available, Members, ActiveLoans;
    public decimal FinesOutstanding, FinesCollected;
    public List<Loan> Overdue { get; set; } = new();
}
