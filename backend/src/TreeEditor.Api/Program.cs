using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Data;
using TreeEditor.Api.Features.Apply;
using TreeEditor.Api.Features.Health;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Features.Reset;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// Connection string is resolved lazily so test hosts can override it via UseSetting.
builder.Services.AddDbContext<TreeDbContext>((services, options) =>
{
    var connectionString = services.GetRequiredService<IConfiguration>().GetConnectionString("Default")
        ?? throw new InvalidOperationException("Connection string 'ConnectionStrings:Default' is not configured.");
    options.UseNpgsql(connectionString);
});
builder.Services.AddScoped<TreeSeeder>();
builder.Services.AddScoped<ApplyService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

await DatabaseInitializer.InitializeAsync(app.Services, app.Lifetime.ApplicationStopping);

app.MapHealthEndpoints();
app.MapNodeEndpoints();
app.MapResetEndpoints();
app.MapApplyEndpoints();

app.Run();

public partial class Program
{
}
