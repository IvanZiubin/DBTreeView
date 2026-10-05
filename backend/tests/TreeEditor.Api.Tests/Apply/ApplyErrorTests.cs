using System.Net;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyErrorTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    private async Task MarkDeletedAsync(long id) =>
        await Factory.WithDbAsync(async db =>
        {
            (await db.Nodes.FindAsync(id))!.IsDeleted = true;
            await db.SaveChangesAsync();
        });

    [Fact]
    public async Task Edit_of_missing_id_is_404()
    {
        var response = await Client.ApplyAsync("""{"edits":[{"id":999999,"value":"x"}],"adds":[],"deletes":[]}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var (problem, ids) = await ApplyHttp.ReadProblemAsync(response);
        Assert.Equal("Not Found", problem.Title);
        Assert.Equal(new long[] { 999999 }, ids);
    }

    [Fact]
    public async Task Missing_delete_and_missing_parent_are_404_with_sorted_ids()
    {
        var del = await Client.ApplyAsync("""{"edits":[],"adds":[],"deletes":[888888]}""");
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);

        var add = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":999999,"value":"x"}],"deletes":[]}""");
        Assert.Equal(HttpStatusCode.NotFound, add.StatusCode);

        var multi = await Client.ApplyAsync("""
            {"edits":[{"id":999999,"value":"x"}],"adds":[{"tempId":"t","parentId":500000,"value":"x"}],"deletes":[777777]}
            """);
        Assert.Equal(HttpStatusCode.NotFound, multi.StatusCode);
        var (_, ids) = await ApplyHttp.ReadProblemAsync(multi);
        Assert.Equal(new long[] { 500000, 777777, 999999 }, ids);
    }

    [Fact]
    public async Task Edit_of_deleted_node_is_409()
    {
        await MarkDeletedAsync(5);

        var response = await Client.ApplyAsync("""{"edits":[{"id":5,"value":"x"}],"adds":[],"deletes":[]}""");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var (problem, ids) = await ApplyHttp.ReadProblemAsync(response);
        Assert.Equal("Conflict", problem.Title);
        Assert.Equal(new long[] { 5 }, ids);
    }

    [Fact]
    public async Task Add_under_deleted_parent_is_409()
    {
        await MarkDeletedAsync(5);

        var response = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":5,"value":"x"}],"deletes":[]}""");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var (_, ids) = await ApplyHttp.ReadProblemAsync(response);
        Assert.Equal(new long[] { 5 }, ids);
    }

    [Fact]
    public async Task Not_found_takes_precedence_over_conflict()
    {
        await MarkDeletedAsync(5);

        var response = await Client.ApplyAsync("""{"edits":[{"id":5,"value":"x"}],"adds":[],"deletes":[999999]}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Nothing_is_persisted_on_error()
    {
        await MarkDeletedAsync(5);

        var response = await Client.ApplyAsync("""
            {"edits":[{"id":5,"value":"x"},{"id":2,"value":"changed"}],"adds":[{"tempId":"t","parentId":3,"value":"n"}],"deletes":[]}
            """);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await Factory.WithDbAsync(async db =>
        {
            Assert.Equal(30, await db.Nodes.CountAsync());
            Assert.Equal("Books", (await db.Nodes.FindAsync(2L))!.Value);
        });
    }
}
