using TreeEditor.Api.Data;

namespace TreeEditor.Api.Features.Nodes;

public static class NodeEndpoints
{
    public static IEndpointRouteBuilder MapNodeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/nodes");
        group.MapGet("/roots", GetRootsAsync);
        group.MapGet("/{id:long}/children", GetChildrenAsync);
        group.MapGet("/{id:long}", GetNodeAsync);
        return app;
    }

    private static async Task<IResult> GetRootsAsync(TreeDbContext db, CancellationToken ct) =>
        Results.Ok(await NodeQueries.GetRootsAsync(db, ct));

    private static async Task<IResult> GetChildrenAsync(long id, TreeDbContext db, CancellationToken ct)
    {
        if (!await NodeQueries.ExistsAsync(db, id, ct))
        {
            return NodeProblems.NotFound(id);
        }

        return Results.Ok(await NodeQueries.GetChildrenAsync(db, id, ct));
    }

    private static async Task<IResult> GetNodeAsync(long id, TreeDbContext db, CancellationToken ct)
    {
        var node = await NodeQueries.GetNodeDetailsAsync(db, id, ct);
        return node is null ? NodeProblems.NotFound(id) : Results.Ok(node);
    }
}
