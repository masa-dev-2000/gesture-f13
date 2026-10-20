using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GestureF13;

public sealed class MainForm : Form
{
    private const int MaxAgeMs = 250;
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer watchdog = new() { Interval = 25 };
    private readonly ShortcutOutput output = new();
    private readonly HashSet<string> lastActive = [];
    private readonly Dictionary<string, long> lastTap = new();
    private GestureSettings settings;
    private long lastResultTick;
    private bool cameraRunning;
    private bool paused;
    private string? startupWarning;
    private string lastOutput = "なし";

    public MainForm()
    {
        try { settings = GestureSettings.Load(); }
        catch (Exception ex)
        {
            settings = new GestureSettings();
            startupWarning = $"設定を読み込めませんでした: {ex.Message}";
        }
        Text = "Gesture Shortcut";
        ClientSize = new Size(1120, 780);
        MinimumSize = new Size(780, 580);
        ShowInTaskbar = true;
        Controls.Add(view);
        watchdog.Tick += (_, _) =>
        {
            if (output.HasDown && (!cameraRunning || paused || Environment.TickCount64 - lastResultTick > MaxAgeMs))
                EmergencyRelease("認識結果が途切れたため、キーを解除しました。");
            else if (output.HasDown)
                TryOutput(() => output.Reconcile());
        };
        Shown += async (_, _) => await InitializeViewAsync();
        FormClosing += (_, _) =>
        {
            watchdog.Stop();
            EmergencyRelease();
        };
    }

    private async Task InitializeViewAsync()
    {
        try
        {
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-timer-throttling --disable-renderer-backgrounding");
            var environment = await CoreWebView2Environment.CreateAsync(null, null, options);
            await view.EnsureCoreWebView2Async(environment);
            string webFolder = Path.Combine(AppContext.BaseDirectory, "web");
            view.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "gesture-shortcut.local", webFolder, CoreWebView2HostResourceAccessKind.DenyCors);
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.PermissionRequested += (_, e) =>
            {
                e.State = e.PermissionKind == CoreWebView2PermissionKind.Camera
                    ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
            };
            view.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith("https://gesture-shortcut.local/", StringComparison.OrdinalIgnoreCase))
                    e.Cancel = true;
                EmergencyRelease();
            };
            view.CoreWebView2.ProcessFailed += (_, _) =>
            {
                cameraRunning = false;
                EmergencyRelease("認識処理が停止しました。アプリを再起動してください。");
            };
            view.CoreWebView2.WebMessageReceived += OnWebMessage;
            view.CoreWebView2.Navigate("https://gesture-shortcut.local/index.html");
            watchdog.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "画面を起動できません", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            switch (root.GetProperty("type").GetString())
            {
                case "ready":
                    PublishState(startupWarning);
                    break;
                case "cameraStarted":
                    cameraRunning = true;
                    lastResultTick = Environment.TickCount64;
                    PublishState();
                    break;
                case "cameraStopped":
                    cameraRunning = false;
                    EmergencyRelease("カメラが停止しました。");
                    PublishState();
                    break;
                case "setPaused":
                    SetPaused(root.GetProperty("paused").GetBoolean());
                    break;
                case "saveSettings":
                    SaveSettings(root.GetProperty("settings"), root.GetProperty("revision").GetInt64());
                    break;
                case "frame":
                    ProcessFrame(root);
                    break;
            }
        }
        catch (Exception ex)
        {
            EmergencyRelease();
            PublishState($"入力処理エラー: {ex.Message}");
        }
    }

    private void SaveSettings(JsonElement data, long revision)
    {
        try
        {
            GestureSettings updated = GestureSettings.Parse(data);
            updated.Save();
            EmergencyRelease();
            settings = updated;
            lastActive.Clear();
            lastOutput = "なし";
            PublishState("設定を保存しました。", revision, true);
        }
        catch (Exception ex)
        {
            PublishState($"設定を保存できませんでした: {ex.Message}", revision, false);
        }
    }

    private void SetPaused(bool value)
    {
        paused = value;
        if (paused) EmergencyRelease();
        PublishState();
    }

    private void ProcessFrame(JsonElement root)
    {
        if (!cameraRunning || paused) return;
        long age = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - root.GetProperty("capturedAt").GetInt64();
        if (age < 0 || age > MaxAgeMs)
        {
            EmergencyRelease($"認識結果が古いため、キーを解除しました（{age} ms）。");
            return;
        }
        lastResultTick = Environment.TickCount64;
        var active = root.GetProperty("active").EnumerateArray()
            .Select(x => x.GetString() ?? "").Where(GestureSettings.GestureIds.Contains).ToHashSet();
        var events = root.GetProperty("events").EnumerateArray()
            .Select(x => x.GetString() ?? "").Where(GestureSettings.GestureIds.Contains).ToArray();
        string heldBefore = string.Join('|', output.HeldNames);

        // Release old posture holds before transition taps; acquire new holds afterward.
        foreach (string id in GestureSettings.GestureIds)
        {
            var binding = settings.Binding(id);
            if (binding.Mode == "hold" && !active.Contains(id))
                TryOutput(() => output.SetHold(id, [], false));
        }
        foreach (string id in events.Concat(active.Where(id => !lastActive.Contains(id))))
        {
            var binding = settings.Binding(id);
            if (binding.Mode != "tap" || string.IsNullOrEmpty(binding.Keys)) continue;
            long now = Environment.TickCount64;
            if (lastTap.TryGetValue(id, out long previous) && now - previous < 300) continue;
            lastTap[id] = now;
            if (TryOutput(() => output.Tap(ShortcutKeys.Parse(binding.Keys))))
            {
                lastOutput = $"{id} → {binding.Keys}（1回）";
                PublishState();
            }
        }
        foreach (string id in GestureSettings.GestureIds)
        {
            var binding = settings.Binding(id);
            if (binding.Mode == "hold" && active.Contains(id))
            {
                if (TryOutput(() => output.SetHold(id, ShortcutKeys.Parse(binding.Keys), true)) &&
                    !lastActive.Contains(id) && !string.IsNullOrEmpty(binding.Keys))
                    lastOutput = $"{id} → {binding.Keys}（長押し）";
            }
        }
        lastActive.Clear();
        lastActive.UnionWith(active);
        if (heldBefore != string.Join('|', output.HeldNames)) PublishState();
    }

    private bool TryOutput(Action action)
    {
        try { action(); return true; }
        catch (Exception ex) { PublishState($"キー入力に失敗しました: {ex.Message}"); return false; }
    }

    public void EmergencyRelease(string? reason = null)
    {
        lastActive.Clear();
        TryOutput(() => output.ReleaseAll());
        if (reason is not null) PublishState(reason);
    }

    private void PublishState(string? message = null, long? saveRevision = null, bool? saveSucceeded = null)
    {
        try
        {
            view.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(new
            {
                type = "hostState", settings, paused, cameraRunning,
                held = output.HeldNames, lastOutput, message, saveRevision, saveSucceeded
            }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        }
        catch { /* Window can be closing. Native release still runs. */ }
    }
}
