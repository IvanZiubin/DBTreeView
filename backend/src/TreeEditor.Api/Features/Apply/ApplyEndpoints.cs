using TreeEditor.Api.Infrastructure;

namespace TreeEditor.Api.Features.Apply;

public static class ApplyEndpoints
{
    public static IEndpointRouteBuilder MapApplyEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/nodes");
        group.MapPost("/apply", Apply);
        return app;
    }

    // Stage 2 stub: the request body is intentionally not bound. Implemented in stage 3.
    private static IResult Apply() =>
        Results.Problem(
            statusCode: StatusCodes.Status501NotImplemented,
            title: "Not Implemented",
            detail: "POST /api/nodes/apply is implemented in stage 3.",
            type: ProblemTypes.NotImplemented);
}
