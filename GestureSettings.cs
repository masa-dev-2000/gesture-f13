using System.Text.Json;
using System.Text.Json.Serialization;

namespace GestureF13;

// One step of a sequence: "shortcut" (Keys), "text" (Text) or "wait" (Ms).
public sealed class GestureStep
{
    public string Kind { get; set; } = "shortcut";
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Keys { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Text { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? Ms { get; set; }
}

public sealed class GestureBinding
{
    public string Gesture { get; set; } = "";
    // v3 stored a single shortcut here; v4 moves it into Steps.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Keys { get; set; }
    public List<GestureStep> Steps { get; set; } = [];
    public string Mode { get; set; } = "tap";
    // Face expressions only: how long the expression must be held before input.
    public int HoldMs { get; set; } = 400;
    // Face expressions only: score needed to react. Lower reacts more easily.
    public double Threshold { get; set; } = 0.6;

    // Holding is only meaningful when the sequence is exactly one shortcut.
    public bool CanHold => Steps.Count == 1 && Steps[0].Kind == "shortcut";
}

public sealed class GestureSettings
{
    public int Version { get; set; } = 4;
    public bool SwapHands { get; set; } = true;
    public bool FaceEnabled { get; set; }
    // Nose offset (-0.4..0.4) that counts as facing front when the camera is off-center.
    public double FaceYawCenter { get; set; }
    public List<GestureBinding> Bindings { get; set; } = Defaults();

    public static readonly string[] GestureIds =
    [
        "L_OPEN", "L_POINT", "L_THUMB_UP", "L_THUMB_DOWN", "L_VICTORY", "L_ILOVEYOU",
        "R_OPEN", "R_POINT", "R_THUMB_UP", "R_THUMB_DOWN", "R_VICTORY", "R_ILOVEYOU",
        "F_MOUTH_OPEN", "F_SMILE", "F_PUCKER", "F_CHEEK_PUFF", "F_TONGUE_OUT", "F_MOUTH_LEFT", "F_MOUTH_RIGHT",
        "F_BROWS_UP", "F_BROWS_DOWN", "F_WINK", "F_HEAD_LEFT", "F_HEAD_RIGHT", "F_HEAD_UP", "F_HEAD_DOWN"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    // AppData is redirected when the app is launched from an MSIX-packaged parent.
    // A folder directly under the user profile stays the same for both launch paths.
    public static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".gesture-shortcut", "settings.json");

    private static List<GestureBinding> Defaults() => GestureIds.Select(id => new GestureBinding
    {
        Gesture = id,
        Mode = "tap"
    }).ToList();

    public static GestureSettings Load()
    {
        string path = SettingsPath;
        if (!File.Exists(path))
        {
            string legacyPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Gesture Shortcut", "settings.json");
            if (!File.Exists(legacyPath)) return new GestureSettings();
            path = legacyPath;
        }
        string json = File.ReadAllText(path);
        using var document = JsonDocument.Parse(json);
        int version = document.RootElement.GetProperty("version").GetInt32();
        if (version is 1 or 2)
        {
            bool swapHands = document.RootElement.GetProperty("swapHands").GetBoolean();
            Backup(path, version);
            var migrated = new GestureSettings { SwapHands = swapHands };
            migrated.Save();
            return migrated;
        }
        var settings = JsonSerializer.Deserialize<GestureSettings>(json, JsonOptions)
            ?? throw new InvalidDataException("設定ファイルを読み込めませんでした。");
        bool upgraded = false;
        if (version == 3)
        {
            foreach (var binding in settings.Bindings ?? [])
            {
                if (binding is null) continue;
                binding.Steps = string.IsNullOrEmpty(binding.Keys) ? [] :
                    [new GestureStep { Kind = "shortcut", Keys = binding.Keys }];
                binding.Keys = null;
                // v3 allowed hold with empty keys; only a single shortcut can still be held.
                if (!binding.CanHold) binding.Mode = "tap";
            }
            settings.Version = 4;
            upgraded = true;
        }
        bool added = settings.AddMissingBindings();
        settings.Validate();
        // Back up only once the upgrade is known to succeed, so a bad file is not copied on every launch.
        if (upgraded) Backup(path, version);
        if (path != SettingsPath || added || upgraded) settings.Save();
        return settings;
    }

    private static void Backup(string path, int version)
    {
        string backupDirectory = Path.GetDirectoryName(SettingsPath)!;
        Directory.CreateDirectory(backupDirectory);
        File.Copy(path, Path.Combine(backupDirectory,
            $"settings.v{version}.backup.{DateTime.UtcNow:yyyyMMddHHmmssfff}.json"));
    }

    public static GestureSettings Parse(JsonElement element)
    {
        var settings = element.Deserialize<GestureSettings>(JsonOptions)
            ?? throw new InvalidDataException("設定を読み込めませんでした。");
        settings.Validate();
        return settings;
    }

    // Settings saved before face expressions existed lack the F_* rows; add them unassigned.
    private bool AddMissingBindings()
    {
        if (Bindings is null) return false;
        var missing = GestureIds.Where(id => !Bindings.Any(b => b?.Gesture == id)).ToList();
        Bindings.AddRange(missing.Select(id => new GestureBinding { Gesture = id }));
        return missing.Count > 0;
    }

    public GestureBinding Binding(string id) => Bindings.First(b => b.Gesture == id);

    public void Validate()
    {
        if (Version != 4 || Bindings is null || Bindings.Count != GestureIds.Length ||
            Bindings.Any(b => b is null) ||
            Bindings.Select(b => b.Gesture).Distinct(StringComparer.Ordinal).Count() != GestureIds.Length ||
            !GestureIds.All(id => Bindings.Any(b => b.Gesture == id)))
            throw new InvalidDataException("ジェスチャー設定の形式が正しくありません。");
        if (FaceYawCenter is < -0.4 or > 0.4)
            throw new InvalidDataException("顔の正面のずれが正しくありません。");
        foreach (var binding in Bindings)
        {
            if (binding.Mode is not ("tap" or "hold"))
                throw new InvalidDataException($"{binding.Gesture} の入力方式が正しくありません。");
            if (binding.HoldMs is < 100 or > 5000)
                throw new InvalidDataException($"{binding.Gesture} の入力までの秒数が正しくありません。");
            if (binding.Threshold is < 0.01 or > 1)
                throw new InvalidDataException($"{binding.Gesture} の反応しやすさが正しくありません。");
            if (binding.Steps is null || binding.Steps.Count > 50 || binding.Steps.Any(s => s is null))
                throw new InvalidDataException($"{binding.Gesture} の手順が正しくありません（最大50手順）。");
            if (binding.Mode == "hold" && !binding.CanHold)
                throw new InvalidDataException($"{binding.Gesture} の長押しは、手順がショートカット1つのときだけ使えます。");
            foreach (var step in binding.Steps)
            {
                switch (step.Kind)
                {
                    case "shortcut":
                        if (ShortcutKeys.Parse(step.Keys).Length == 0)
                            throw new InvalidDataException($"{binding.Gesture} のショートカットが空です。");
                        break;
                    case "text":
                        if (string.IsNullOrEmpty(step.Text) || step.Text.Length > 1000)
                            throw new InvalidDataException($"{binding.Gesture} の文字入力は1〜1000文字です。");
                        break;
                    case "wait":
                        if (step.Ms is not (>= 0 and <= 10000))
                            throw new InvalidDataException($"{binding.Gesture} の待機は0〜10秒です。");
                        break;
                    default:
                        throw new InvalidDataException($"{binding.Gesture} の手順の種類が正しくありません。");
                }
            }
        }
    }

    public void Save()
    {
        Validate();
        string path = SettingsPath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        string temporary = path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(this, JsonOptions));
        File.Move(temporary, path, true);
    }
}
