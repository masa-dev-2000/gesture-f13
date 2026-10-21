namespace GestureF13;

// Runs a binding's steps one by one on the UI thread, so it shares ShortcutOutput safely.
// A gesture that is already running ignores new triggers. CancelAll stops every sequence
// at its next step or wait; Tap always releases its own keys.
internal sealed class SequenceRunner(ShortcutOutput output, Action<string> report)
{
    private static readonly TimeSpan MaxDuration = TimeSpan.FromSeconds(30);
    private readonly Dictionary<string, CancellationTokenSource> running = new();

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
        foreach (var cancel in running.Values) cancel.Cancel();
    }

    private async Task RunAsync(string id, GestureStep[] steps, CancellationTokenSource cancel)
    {
        try
        {
            foreach (var step in steps)
            {
                cancel.Token.ThrowIfCancellationRequested();
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
            report($"{id} の連続操作を中止しました。");
        }
        catch (Exception ex)
        {
            report($"{id} の連続操作に失敗しました: {ex.Message}");
        }
        finally
        {
            running.Remove(id);
            cancel.Dispose();
        }
    }
}
