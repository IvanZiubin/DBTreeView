using System.Text.Json;
using Microsoft.Extensions.Options;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace TreeEditor.Api.Features.Apply;

public static class ApplyEndpoints
{
    public static IEndpointRouteBuilder MapApplyEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/nodes");
        group.MapPost("/apply", ApplyAsync);
        return app;
    }

    // The body is read manually (no [FromBody]) so that a missing, empty or malformed body with any
    // or no Content-Type yields 400 ValidationProblemDetails with key "body" instead of 415/plain 400.
    private static async Task<IResult> ApplyAsync(
        HttpRequest httpRequest,
        ApplyService service,
        IOptions<HttpJsonOptions> jsonOptions,
        CancellationToken ct)
    {
        ApplyRequest? request;
        try
        {
            request = await JsonSerializer.DeserializeAsync<ApplyRequest>(
                httpRequest.Body,
                jsonOptions.Value.SerializerOptions,
                ct);
        }
        catch (JsonException ex)
        {
            return ApplyProblems.Validation(new Dictionary<string, string[]>
            {
                ["body"] = new[] { $"Request body is not a valid ApplyRequest JSON object: {ex.Message}" },
            });
        }

        if (request is null)
        {
            return ApplyProblems.Validation(new Dictionary<string, string[]>
            {
                ["body"] = new[] { "Request body is required." },
            });
        }

        if (!ApplyValidator.TryValidate(request, out var command, out var errors))
        {
            return ApplyProblems.Validation(errors);
        }

        var outcome = await service.ApplyAsync(command, ct);
        return outcome switch
        {
            ApplyOutcome.Success success => Results.Ok(success.Response),
            ApplyOutcome.NotFound notFound => ApplyProblems.NotFound(notFound.NodeIds),
            ApplyOutcome.Conflict conflict => ApplyProblems.Conflict(conflict.NodeIds),
            _ => throw new InvalidOperationException($"Unhandled apply outcome {outcome.GetType().Name}."),
        };
    }
}
