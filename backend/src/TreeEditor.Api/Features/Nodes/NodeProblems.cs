using TreeEditor.Api.Infrastructure;

namespace TreeEditor.Api.Features.Nodes;

public static class NodeProblems
{
    public static IResult NotFound(long id) =>
        Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Not Found",
            detail: $"Node {id} does not exist.",
            type: ProblemTypes.NotFound);
}
