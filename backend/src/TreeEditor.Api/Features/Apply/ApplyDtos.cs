using TreeEditor.Api.Features.Nodes;

namespace TreeEditor.Api.Features.Apply;

/// <summary>
/// Body of POST /api/nodes/apply. Every member is nullable so the validator can report
/// missing fields as 400 with a JSON-path key instead of silently using defaults.
/// </summary>
public sealed class ApplyRequest
{
    public List<ApplyEditItem?>? Edits { get; init; }

    public List<ApplyAddItem?>? Adds { get; init; }

    public List<long>? Deletes { get; init; }

    public List<long>? RefreshIds { get; init; }
}

public sealed class ApplyEditItem
{
    public long? Id { get; init; }

    public string? Value { get; init; }
}

public sealed class ApplyAddItem
{
    public string? TempId { get; init; }

    public long? ParentId { get; init; }

    public string? ParentTempId { get; init; }

    public string? Value { get; init; }
}

/// <summary>idMap: tempId -> real id (insert order). nodes: post-apply NodeDetails ordered by id.</summary>
public sealed record ApplyResponse(IReadOnlyDictionary<string, long> IdMap, IReadOnlyList<NodeDetailsDto> Nodes);
