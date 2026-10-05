namespace TreeEditor.Api.Features.Apply;

public sealed record ValidatedEdit(long Id, string Value);

/// <summary>Exactly one of ParentId / ParentTempId is non-null. Value is already trimmed.</summary>
public sealed record ValidatedAdd(string TempId, long? ParentId, string? ParentTempId, string Value);

/// <summary>
/// A request that passed validation. Adds are in insert order (parents before children);
/// DeleteIds and RefreshIds are de-duplicated.
/// </summary>
public sealed record ApplyCommand(
    IReadOnlyList<ValidatedEdit> Edits,
    IReadOnlyList<ValidatedAdd> Adds,
    IReadOnlyList<long> DeleteIds,
    IReadOnlyList<long> RefreshIds);

public abstract record ApplyOutcome
{
    public sealed record Success(ApplyResponse Response) : ApplyOutcome;

    /// <summary>Referenced real ids that do not exist, sorted ascending.</summary>
    public sealed record NotFound(IReadOnlyList<long> NodeIds) : ApplyOutcome;

    /// <summary>Edit targets / real add parents already deleted before the request, sorted ascending.</summary>
    public sealed record Conflict(IReadOnlyList<long> NodeIds) : ApplyOutcome;
}
