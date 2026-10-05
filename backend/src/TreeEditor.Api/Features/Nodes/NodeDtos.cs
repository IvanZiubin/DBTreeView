namespace TreeEditor.Api.Features.Nodes;

public sealed record NodeDto(long Id, long? ParentId, string Value, bool IsDeleted, bool HasChildren);

public sealed record NodeDetailsDto(
    long Id,
    long? ParentId,
    string Value,
    bool IsDeleted,
    bool HasChildren,
    IReadOnlyList<long> AncestorIds);
