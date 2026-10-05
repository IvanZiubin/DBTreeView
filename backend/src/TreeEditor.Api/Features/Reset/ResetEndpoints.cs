using TreeEditor.Api.Data;
using TreeEditor.Api.Features.Nodes;

namespace TreeEditor.Api.Features.Reset;

public static class ResetEndpoints
{
    public static IEndpointRouteBuilder MapResetEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api");
        group.MapPost("/reset", ResetAsync);
        return app;
    }

    private static async Task<IResult> ResetAsync(TreeSeeder seeder, TreeDbContext db, CancellationToken ct)
    {
        await seeder.ResetAsync(ct);
        return Results.Ok(await NodeQueries.GetRootsAsync(db, ct));
    }
}
