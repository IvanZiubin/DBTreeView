namespace TreeEditor.Api.Data;

public sealed class Node
{
    public long Id { get; set; }

    public long? ParentId { get; set; }

    public string Value { get; set; } = string.Empty;

    public bool IsDeleted { get; set; }

    public Node? Parent { get; set; }

    public List<Node> Children { get; set; } = new();
}
