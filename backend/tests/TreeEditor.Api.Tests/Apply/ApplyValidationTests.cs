using System.Net;
using System.Text;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyValidationTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    private async Task<IDictionary<string, string[]>> Expect400Async(string json)
    {
        var response = await Client.ApplyAsync(json);
        var problem = await ApplyHttp.ReadValidationAsync(response);
        return problem.Errors;
    }

    private static string Edit(string value) => $$"""{"edits":[{"id":2,"value":{{System.Text.Json.JsonSerializer.Serialize(value)}}}],"adds":[],"deletes":[]}""";

    private static string Add(string value) => $$"""{"edits":[],"adds":[{"tempId":"t","parentId":2,"value":{{System.Text.Json.JsonSerializer.Serialize(value)}}}],"deletes":[]}""";

    [Fact]
    public async Task No_body_is_400_with_body_key()
    {
        var response = await Client.PostAsync("/api/nodes/apply", null);
        var problem = await ApplyHttp.ReadValidationAsync(response);
        Assert.Contains("body", problem.Errors.Keys);
    }

    [Fact]
    public async Task Text_plain_content_type_is_not_415()
    {
        var response = await Client.ApplyAsync(ApplyHttp.EmptyRequest, "text/plain");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("{\"edits\":")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("{\"edits\":[{\"id\":\"abc\",\"value\":\"x\"}],\"adds\":[],\"deletes\":[]}")]
    public async Task Bad_body_shapes_give_body_key(string json)
    {
        var errors = await Expect400Async(json);
        Assert.Contains("body", errors.Keys);
    }

    [Fact]
    public async Task Missing_arrays_are_reported()
    {
        var errors = await Expect400Async("{}");
        Assert.Contains("edits", errors.Keys);
        Assert.Contains("adds", errors.Keys);
        Assert.Contains("deletes", errors.Keys);
        Assert.DoesNotContain("refreshIds", errors.Keys);
    }

    [Fact]
    public async Task Edit_value_rules()
    {
        Assert.Contains("edits[0].value", (await Expect400Async(Edit("   "))).Keys);
        Assert.Contains("edits[0].value", (await Expect400Async(Edit(new string('a', 201)))).Keys);
        Assert.Contains("edits[0].value", (await Expect400Async("""{"edits":[{"id":2}],"adds":[],"deletes":[]}""")).Keys);
        Assert.Contains("edits[0].value", (await Expect400Async(Edit("  " + new string('a', 201) + "  "))).Keys);
        var ok = await Client.ApplyAsync(Edit(new string('a', 200)));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Add_value_rules()
    {
        Assert.Contains("adds[0].value", (await Expect400Async(Add("   "))).Keys);
        Assert.Contains("adds[0].value", (await Expect400Async(Add(new string('a', 201)))).Keys);
        Assert.Contains("adds[0].value", (await Expect400Async("""{"edits":[],"adds":[{"tempId":"t","parentId":2}],"deletes":[]}""")).Keys);
        var ok = await Client.ApplyAsync(Add(new string('a', 200)));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Value_length_is_counted_in_code_points()
    {
        var emoji200 = string.Concat(Enumerable.Repeat("\U0001F600", 200));
        var emoji201 = string.Concat(Enumerable.Repeat("\U0001F600", 201));

        var ok = await Client.ApplyAsync(Edit(emoji200));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("edits[0].value", (await Expect400Async(Edit(emoji201))).Keys);
    }

    [Fact]
    public async Task Value_with_nul_is_rejected()
    {
        var errors = await Expect400Async("""{"edits":[{"id":2,"value":"a\u0000b"}],"adds":[],"deletes":[]}""");
        Assert.Contains("edits[0].value", errors.Keys);
    }

    [Fact]
    public async Task Edit_id_rules()
    {
        Assert.Contains("edits[0].id", (await Expect400Async("""{"edits":[{"value":"x"}],"adds":[],"deletes":[]}""")).Keys);
        Assert.Contains("edits[1].id", (await Expect400Async("""{"edits":[{"id":2,"value":"a"},{"id":2,"value":"b"}],"adds":[],"deletes":[]}""")).Keys);
    }

    [Fact]
    public async Task TempId_rules()
    {
        Assert.Contains("adds[0].tempId", (await Expect400Async("""{"edits":[],"adds":[{"tempId":"","parentId":2,"value":"x"}],"deletes":[]}""")).Keys);
        Assert.Contains("adds[0].tempId", (await Expect400Async($$"""{"edits":[],"adds":[{"tempId":"{{new string('t', 65)}}","parentId":2,"value":"x"}],"deletes":[]}""")).Keys);
        var ok = await Client.ApplyAsync($$"""{"edits":[],"adds":[{"tempId":"{{new string('t', 64)}}","parentId":2,"value":"x"}],"deletes":[]}""");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("adds[1].tempId", (await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","parentId":2,"value":"x"},{"tempId":"a","parentId":2,"value":"y"}],"deletes":[]}""")).Keys);
    }

    [Fact]
    public async Task Exactly_one_parent_reference_required()
    {
        Assert.Contains("adds[0]", (await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","value":"x"}],"deletes":[]}""")).Keys);
        Assert.Contains("adds[0]", (await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","parentId":2,"parentTempId":"a","value":"x"}],"deletes":[]}""")).Keys);
    }

    [Fact]
    public async Task Unknown_parentTempId()
    {
        var errors = await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","parentTempId":"zzz","value":"x"}],"deletes":[]}""");
        Assert.Contains("adds[0].parentTempId", errors.Keys);
    }

    [Fact]
    public async Task Cycles_are_rejected()
    {
        var errors = await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","parentTempId":"b","value":"A"},{"tempId":"b","parentTempId":"a","value":"B"}],"deletes":[]}""");
        Assert.Contains("adds[0].parentTempId", errors.Keys);
        Assert.Contains("adds[1].parentTempId", errors.Keys);

        var self = await Expect400Async("""{"edits":[],"adds":[{"tempId":"a","parentTempId":"a","value":"A"}],"deletes":[]}""");
        Assert.Contains("adds[0].parentTempId", self.Keys);
    }

    [Fact]
    public async Task Limits()
    {
        var edits = string.Join(",", Enumerable.Range(1, 1001).Select(i => $$"""{"id":{{i}},"value":"v"}"""));
        Assert.Contains("edits", (await Expect400Async($$"""{"edits":[{{edits}}],"adds":[],"deletes":[]}""")).Keys);

        var adds = string.Join(",", Enumerable.Range(1, 1001).Select(i => $$"""{"tempId":"t{{i}}","parentId":2,"value":"v"}"""));
        Assert.Contains("adds", (await Expect400Async($$"""{"edits":[],"adds":[{{adds}}],"deletes":[]}""")).Keys);

        var deletes1001 = string.Join(",", Enumerable.Range(1, 1001));
        Assert.Contains("deletes", (await Expect400Async($$"""{"edits":[],"adds":[],"deletes":[{{deletes1001}}]}""")).Keys);

        var refresh = string.Join(",", Enumerable.Range(1, 10001));
        Assert.Contains("refreshIds", (await Expect400Async($$"""{"edits":[],"adds":[],"deletes":[],"refreshIds":[{{refresh}}]}""")).Keys);

        var deletes1000 = string.Join(",", Enumerable.Range(1, 1000));
        var notFound = await Client.ApplyAsync($$"""{"edits":[],"adds":[],"deletes":[{{deletes1000}}]}""");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task Validation_runs_before_db_access()
    {
        var response = await Client.ApplyAsync("""{"edits":[{"id":999999,"value":"ok"},{"id":2,"value":"   "}],"adds":[],"deletes":[]}""");

        await ApplyHttp.ReadValidationAsync(response);
        await Factory.WithDbAsync(async db => Assert.Equal("Books", (await db.Nodes.FindAsync(2L))!.Value));
    }

    [Fact]
    public async Task Validation_response_shape()
    {
        var response = await Client.ApplyAsync(Edit("   "));
        var problem = await ApplyHttp.ReadValidationAsync(response);

        Assert.Equal(400, problem.Status);
        Assert.Equal("One or more validation errors occurred.", problem.Title);
        Assert.Equal("https://tools.ietf.org/html/rfc9110#section-15.5.1", problem.Type);
    }
}
