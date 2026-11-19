namespace LibraryManagement.Controllers;

[Authorize]
public class HomeController : Controller
{
    public IActionResult Index() =>
        User.IsInRole("Admin") ? RedirectToAction("Index", "Admin") : RedirectToAction("Index", "Loans");
}
