using TreeEditor.Api.Data;
using TreeEditor.Api.Infrastructure;

namespace TreeEditor.Api.Features.Health;

public sealed record HealthResponse(string Status);

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api");
        group.MapGet("/health", GetHealthAsync);
        return app;
    }

    private static async Task<IResult> GetHealthAsync(TreeDbContext db, CancellationToken ct)
    {
        bool canConnect;
        try
        {
            canConnect = await db.Database.CanConnectAsync(ct);
        }
        catch (Exception)
        {
            canConnect = false;
        }

        return canConnect
            ? Results.Ok(new HealthResponse("ok"))
            : Results.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Service Unavailable",
                detail: "The database is unreachable.",
                type: ProblemTypes.ServiceUnavailable);
    }
}
