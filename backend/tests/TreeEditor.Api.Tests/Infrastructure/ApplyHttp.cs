using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TreeEditor.Api.Features.Apply;

namespace TreeEditor.Api.Tests.Infrastructure;

/// <summary>Helpers for posting raw JSON to POST /api/nodes/apply and reading its responses.</summary>
public static class ApplyHttp
{
    public const string EmptyRequest = """{"edits":[],"adds":[],"deletes":[]}""";

    public const string InvariantSql =
        "SELECT count(*) AS \"Value\" FROM nodes c JOIN nodes p ON p.id = c.parent_id WHERE p.is_deleted AND NOT c.is_deleted";

    public static Task<HttpResponseMessage> ApplyAsync(this HttpClient client, string json, string contentType = "application/json") =>
        client.PostAsync("/api/nodes/apply", new StringContent(json, Encoding.UTF8, contentType));

    public static async Task<ApplyResponse> ApplyOkAsync(this HttpClient client, string json)
    {
        var response = await client.ApplyAsync(json);
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ApplyResponse>();
        Assert.NotNull(body);
        return body;
    }

    public static async Task<HttpValidationProblemDetails> ReadValidationAsync(HttpResponseMessage response)
    {
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>();
        Assert.NotNull(problem);
        return problem;
    }

    public static async Task<(ProblemDetails Problem, long[] NodeIds)> ReadProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        var ids = problem.Extensions.TryGetValue("nodeIds", out var raw) && raw is JsonElement el
            ? el.EnumerateArray().Select(e => e.GetInt64()).ToArray()
            : Array.Empty<long>();
        return (problem, ids);
    }
}
