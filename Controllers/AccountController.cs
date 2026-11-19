using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace LibraryManagement.Controllers;

public class AccountController(AppDbContext db) : Controller
{
    [HttpGet] public IActionResult Login() => View(new LoginVm());

    [HttpPost]
    public async Task<IActionResult> Login(LoginVm vm)
    {
        if (!ModelState.IsValid) return View(vm);
        var email = vm.Email.Trim().ToLower();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || !Passwords.Verify(vm.Password, user.PasswordHash))
        {
            ModelState.AddModelError("", "Invalid email or password.");
            return View(vm);
        }
        await SignInAsync(user);
        return RedirectToAction("Index", "Home");
    }

    [HttpGet] public IActionResult Register() => View(new RegisterVm());

    [HttpPost]   // self-registration always creates a Student; librarians create Staff/Admin accounts
    public async Task<IActionResult> Register(RegisterVm vm)
    {
        var email = vm.Email.Trim().ToLower();
        if (await db.Users.AnyAsync(u => u.Email == email))
            ModelState.AddModelError(nameof(vm.Email), "This email is already registered.");
        if (!ModelState.IsValid) return View(vm);

        var user = new AppUser { FullName = vm.FullName.Trim(), Email = email, PasswordHash = Passwords.Hash(vm.Password), Role = Role.Student };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        await SignInAsync(user);
        return RedirectToAction("Index", "Home");
    }

    [HttpPost]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction(nameof(Login));
    }

    public IActionResult AccessDenied() => View();

    private Task SignInAsync(AppUser u)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, u.Id.ToString()),
            new(ClaimTypes.Name, u.FullName),
            new(ClaimTypes.Role, u.Role.ToString())
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
        return HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal);
    }
}
