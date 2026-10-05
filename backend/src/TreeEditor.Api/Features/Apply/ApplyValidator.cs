using System.Diagnostics.CodeAnalysis;

namespace TreeEditor.Api.Features.Apply;

/// <summary>
/// Shape and value validation of an apply request (contract v2 apply_semantics). No database access.
/// Error keys are JSON paths: edits, adds, deletes, refreshIds, edits[i], edits[i].id, edits[i].value,
/// adds[i], adds[i].tempId, adds[i].parentTempId, adds[i].value.
/// </summary>
public static class ApplyValidator
{
    public const int MaxEdits = 1000;
    public const int MaxAdds = 1000;
    public const int MaxDeletes = 1000;
    public const int MaxRefreshIds = 10000;
    public const int MaxTempIdLength = 64;
    public const int MaxValueLength = 200;

    public static bool TryValidate(
        ApplyRequest request,
        [NotNullWhen(true)] out ApplyCommand? command,
        out Dictionary<string, string[]> errors)
    {
        var found = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        CheckArray(request.Edits, "edits", MaxEdits, required: true, found);
        CheckArray(request.Adds, "adds", MaxAdds, required: true, found);
        CheckArray(request.Deletes, "deletes", MaxDeletes, required: true, found);
        CheckArray(request.RefreshIds, "refreshIds", MaxRefreshIds, required: false, found);

        var edits = new List<ValidatedEdit>();
        var adds = new List<ValidatedAdd>();
        if (found.Count == 0)
        {
            edits = ValidateEdits(request.Edits!, found);
            adds = ValidateAdds(request.Adds!, found);
        }

        if (found.Count > 0)
        {
            command = null;
            errors = found.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray(), StringComparer.Ordinal);
            return false;
        }

        command = new ApplyCommand(
            edits,
            adds,
            request.Deletes!.Distinct().ToArray(),
            request.RefreshIds?.Distinct().ToArray() ?? Array.Empty<long>());
        errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        return true;
    }

    private static void CheckArray<T>(
        List<T>? items,
        string key,
        int max,
        bool required,
        Dictionary<string, List<string>> errors)
    {
        if (items is null)
        {
            if (required)
            {
                AddError(errors, key, $"The '{key}' array is required.");
            }

            return;
        }

        if (items.Count > max)
        {
            AddError(errors, key, $"At most {max} items are allowed in '{key}'.");
        }
    }

    private static List<ValidatedEdit> ValidateEdits(
        List<ApplyEditItem?> items,
        Dictionary<string, List<string>> errors)
    {
        var result = new List<ValidatedEdit>(items.Count);
        var seenIds = new HashSet<long>();

        for (var i = 0; i < items.Count; i++)
        {
            var path = $"edits[{i}]";
            var item = items[i];
            if (item is null)
            {
                AddError(errors, path, "Edit item must not be null.");
                continue;
            }

            if (item.Id is not { } id)
            {
                AddError(errors, $"{path}.id", "id is required.");
            }
            else if (!seenIds.Add(id))
            {
                AddError(errors, $"{path}.id", $"Duplicate edit id {id}.");
            }

            var value = NormalizeValue(item.Value, $"{path}.value", errors);
            if (item.Id is { } validId && value is not null)
            {
                result.Add(new ValidatedEdit(validId, value));
            }
        }

        return result;
    }

    private static List<ValidatedAdd> ValidateAdds(
        List<ApplyAddItem?> items,
        Dictionary<string, List<string>> errors)
    {
        // All add error keys start with "adds[", so a growing key count means an add failed.
        var keyCountBefore = errors.Count;
        var indexByTempId = new Dictionary<string, int>(StringComparer.Ordinal);
        var values = new string?[items.Count];

        for (var i = 0; i < items.Count; i++)
        {
            var path = $"adds[{i}]";
            var item = items[i];
            if (item is null)
            {
                AddError(errors, path, "Add item must not be null.");
                continue;
            }

            if (string.IsNullOrEmpty(item.TempId))
            {
                AddError(errors, $"{path}.tempId", "tempId is required and must not be empty.");
            }
            else if (item.TempId.Length > MaxTempIdLength)
            {
                AddError(errors, $"{path}.tempId", $"tempId must be at most {MaxTempIdLength} characters.");
            }
            else if (!indexByTempId.TryAdd(item.TempId, i))
            {
                AddError(errors, $"{path}.tempId", $"Duplicate tempId '{item.TempId}'.");
            }

            if ((item.ParentId is null) == (item.ParentTempId is null))
            {
                AddError(errors, path, "Exactly one of parentId or parentTempId must be set.");
            }

            values[i] = NormalizeValue(item.Value, $"{path}.value", errors);
        }

        if (errors.Count > keyCountBefore)
        {
            return new List<ValidatedAdd>();
        }

        for (var i = 0; i < items.Count; i++)
        {
            var parentTempId = items[i]!.ParentTempId;
            if (parentTempId is not null && !indexByTempId.ContainsKey(parentTempId))
            {
                AddError(
                    errors,
                    $"adds[{i}].parentTempId",
                    $"Unknown parentTempId '{parentTempId}': no add in this request has that tempId.");
            }
        }

        if (errors.Count > keyCountBefore)
        {
            return new List<ValidatedAdd>();
        }

        // Kahn's algorithm, breadth-first: real-parent adds in request order, then their
        // temp children level by level in request order. Parents always precede children.
        var children = new List<int>[items.Count];
        for (var i = 0; i < items.Count; i++)
        {
            children[i] = new List<int>();
        }

        var queue = new Queue<int>();
        for (var i = 0; i < items.Count; i++)
        {
            var parentTempId = items[i]!.ParentTempId;
            if (parentTempId is null)
            {
                queue.Enqueue(i);
            }
            else
            {
                children[indexByTempId[parentTempId]].Add(i);
            }
        }

        var order = new List<int>(items.Count);
        while (queue.TryDequeue(out var index))
        {
            order.Add(index);
            foreach (var child in children[index])
            {
                queue.Enqueue(child);
            }
        }

        if (order.Count < items.Count)
        {
            var placed = new HashSet<int>(order);
            for (var i = 0; i < items.Count; i++)
            {
                if (!placed.Contains(i))
                {
                    AddError(
                        errors,
                        $"adds[{i}].parentTempId",
                        "parentTempId chain forms a cycle and never reaches a real parentId.");
                }
            }

            return new List<ValidatedAdd>();
        }

        return order
            .Select(i =>
            {
                var item = items[i]!;
                return new ValidatedAdd(item.TempId!, item.ParentId, item.ParentTempId, values[i]!);
            })
            .ToList();
    }

    /// <summary>Trims and checks length 1..200 in Unicode code points (same unit as PostgreSQL char_length).</summary>
    private static string? NormalizeValue(string? raw, string key, Dictionary<string, List<string>> errors)
    {
        if (raw is null)
        {
            AddError(errors, key, "value is required.");
            return null;
        }

        var trimmed = raw.Trim();
        if (!TryCountCodePoints(trimmed, out var length))
        {
            AddError(errors, key, "value must not contain NUL characters or unpaired surrogates.");
            return null;
        }

        if (length == 0)
        {
            AddError(errors, key, "value must not be empty or whitespace only.");
            return null;
        }

        if (length > MaxValueLength)
        {
            AddError(errors, key, $"value must be at most {MaxValueLength} characters after trimming.");
            return null;
        }

        return trimmed;
    }

    private static bool TryCountCodePoints(string text, out int count)
    {
        count = 0;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (c == '\0' || char.IsLowSurrogate(c))
            {
                return false;
            }

            if (char.IsHighSurrogate(c))
            {
                if (i + 1 >= text.Length || !char.IsLowSurrogate(text[i + 1]))
                {
                    return false;
                }

                i++;
            }

            count++;
        }

        return true;
    }

    private static void AddError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var messages))
        {
            messages = new List<string>();
            errors[key] = messages;
        }

        messages.Add(message);
    }
}
