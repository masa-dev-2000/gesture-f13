namespace GestureF13;

// Runs a binding's steps one by one on the UI thread, so it shares ShortcutOutput safely.
// A gesture that is already running ignores new triggers. CancelAll stops every sequence
// at its next step or wait; Tap always releases its own keys.
internal sealed class SequenceRunner(ShortcutOutput output, Action<string> report)
{
    private static readonly TimeSpan MaxDuration = TimeSpan.FromSeconds(30);
    private readonly Dictionary<string, CancellationTokenSource> running = new();
    private readonly HashSet<CancellationTokenSource> silenced = new();

    public bool IsRunning(string id) => running.ContainsKey(id);

    public void Start(string id, IReadOnlyList<GestureStep> steps)
    {
        if (steps.Count == 0 || running.ContainsKey(id)) return;
        var cancel = new CancellationTokenSource(MaxDuration);
        running[id] = cancel;
        _ = RunAsync(id, steps.ToArray(), cancel);
    }

    public void CancelAll()
    {
        // The caller reports its own reason, so these runs stop quietly.
        foreach (var cancel in running.Values)
        {
            silenced.Add(cancel);
            cancel.Cancel();
        }
    }

    private async Task RunAsync(string id, GestureStep[] steps, CancellationTokenSource cancel)
    {
        try
        {
            foreach (var step in steps)
            {
                cancel.Token.ThrowIfCancellationRequested();
                // Keys held by another gesture (e.g. Ctrl) would combine with typed text or shortcuts.
                if (step.Kind != "wait" && output.IsHolding)
                {
                    report($"{id} の連続操作を中止しました（長押し中のキーがあるため）。");
                    return;
                }
                switch (step.Kind)
                {
                    case "shortcut": output.Tap(ShortcutKeys.Parse(step.Keys)); break;
                    case "text": ShortcutKeys.SendText(step.Text ?? ""); break;
                    case "wait": await Task.Delay(step.Ms ?? 0, cancel.Token); break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            if (!silenced.Contains(cancel)) report($"{id} の連続操作を時間切れで中止しました。");
        }
        catch (Exception ex)
        {
            report($"{id} の連続操作に失敗しました: {ex.Message}");
        }
        finally
        {
            running.Remove(id);
            silenced.Remove(cancel);
            cancel.Dispose();
        }
    }
}
