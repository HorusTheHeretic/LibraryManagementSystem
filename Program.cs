using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews(o => o.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));

// Default: MySQL Server 8.x (the server MySQL Workbench connects to).
// Set "Database:UseMariaDb" to true in appsettings.json if you use MariaDB (e.g. XAMPP).
ServerVersion dbVersion = builder.Configuration.GetValue<bool>("Database:UseMariaDb")
    ? new MariaDbServerVersion(new Version(10, 4, 32))
    : new MySqlServerVersion(new Version(8, 0, 36));
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseMySql(builder.Configuration.GetConnectionString("Default"), dbVersion));

builder.Services.AddScoped<LibraryService>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o => { o.LoginPath = "/Account/Login"; o.AccessDeniedPath = "/Account/AccessDenied"; });
builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();   // creates the 'librarydb' database + tables on first run
    DbSeeder.Seed(db);
}

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultControllerRoute();
app.Run();
