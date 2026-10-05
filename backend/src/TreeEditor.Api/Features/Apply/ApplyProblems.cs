using TreeEditor.Api.Infrastructure;

namespace TreeEditor.Api.Features.Apply;

public static class ApplyProblems
{
    public static IResult Validation(Dictionary<string, string[]> errors) =>
        Results.ValidationProblem(
            errors,
            detail: "The apply request is invalid; nothing was changed.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "One or more validation errors occurred.",
            type: ProblemTypes.BadRequest);

    public static IResult NotFound(IReadOnlyList<long> nodeIds) =>
        Results.Problem(
            detail: $"Node(s) {string.Join(", ", nodeIds)} do not exist; nothing was changed.",
            statusCode: StatusCodes.Status404NotFound,
            title: "Not Found",
            type: ProblemTypes.NotFound,
            extensions: new Dictionary<string, object?> { ["nodeIds"] = nodeIds.ToArray() });

    public static IResult Conflict(IReadOnlyList<long> nodeIds) =>
        Results.Problem(
            detail: $"Node(s) {string.Join(", ", nodeIds)} are already deleted and cannot be edited or receive children; nothing was changed.",
            statusCode: StatusCodes.Status409Conflict,
            title: "Conflict",
            type: ProblemTypes.Conflict,
            extensions: new Dictionary<string, object?> { ["nodeIds"] = nodeIds.ToArray() });
}
