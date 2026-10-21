using System.ComponentModel;
using System.Runtime.InteropServices;

namespace GestureF13;

internal static class ShortcutKeys
{
    public static readonly Dictionary<string, ushort> Catalog = CreateCatalog();
    private static readonly HashSet<ushort> Extended = [0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2E, 0x5B, 0xAD, 0xAE, 0xAF, 0xB3];

    private static Dictionary<string, ushort> CreateCatalog()
    {
        var keys = new Dictionary<string, ushort>(StringComparer.Ordinal)
        {
            ["CTRL"] = 0x11, ["SHIFT"] = 0x10, ["ALT"] = 0x12, ["WIN"] = 0x5B,
            ["ENTER"] = 0x0D, ["TAB"] = 9, ["ESC"] = 27, ["SPACE"] = 32,
            ["BACKSPACE"] = 8, ["DELETE"] = 46, ["LEFT"] = 37, ["UP"] = 38,
            ["RIGHT"] = 39, ["DOWN"] = 40, ["HOME"] = 36, ["END"] = 35,
            ["PAGEUP"] = 33, ["PAGEDOWN"] = 34, ["VOLUMEUP"] = 175,
            ["VOLUMEDOWN"] = 174, ["MUTE"] = 173, ["PLAYPAUSE"] = 179
        };
        foreach (char c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") keys[c.ToString()] = c;
        for (int i = 1; i <= 24; i++) keys[$"F{i}"] = (ushort)(111 + i);
        return keys;
    }

    public static ushort[] Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];
        var names = value.Split('+', StringSplitOptions.TrimEntries);
        if (names.Length > 8 || names.Any(n => !Catalog.ContainsKey(n)) ||
            names.Distinct(StringComparer.Ordinal).Count() != names.Length)
            throw new InvalidDataException($"キー指定が正しくありません: {value}");
        return names.Select(n => Catalog[n]).ToArray();
    }

    private const uint Keyboard = 1;
    private const uint KeyUp = 2;
    private const uint ExtendedKey = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyInput
    {
        public ushort VirtualKey;
        public ushort Scan;
        public uint Flags;
        public uint Time;
        public nuint ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X, Y;
        public uint Data, Flags, Time;
        public nuint ExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyInput Key;
        [FieldOffset(0)] public MouseInput Mouse;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Data;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, [In] Input[] inputs, int size);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint code, uint mapType);

    private const uint Unicode = 4;

    // Text goes out as Unicode key events, so IME conversion is bypassed and Japanese
    // arrives as written. Newline and tab are sent as real Enter/Tab keys.
    public static void SendText(string text)
    {
        var inputs = new List<Input>();
        void Add(ushort vk, ushort scan, uint flags) => inputs.Add(new Input
        {
            Type = Keyboard,
            Data = new InputUnion { Key = new KeyInput { VirtualKey = vk, Scan = scan, Flags = flags } }
        });
        foreach (char c in text.Replace("\r\n", "\n").Replace('\r', '\n'))
        {
            if (c is '\n' or '\t')
            {
                ushort vk = c == '\n' ? (ushort)0x0D : (ushort)0x09;
                ushort scan = (ushort)MapVirtualKey(vk, 0);
                Add(vk, scan, 0);
                Add(vk, scan, KeyUp);
            }
            else
            {
                Add(0, c, Unicode);
                Add(0, c, Unicode | KeyUp);
            }
        }
        if (inputs.Count == 0) return;
        if (SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<Input>()) != inputs.Count)
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    public static void Send(ushort key, bool down)
    {
        var input = new Input
        {
            Type = Keyboard,
            Data = new InputUnion { Key = new KeyInput
            {
                VirtualKey = key,
                Scan = (ushort)MapVirtualKey(key, 0),
                Flags = (down ? 0u : KeyUp) | (Extended.Contains(key) ? ExtendedKey : 0u)
            } }
        };
        if (SendInput(1, [input], Marshal.SizeOf<Input>()) != 1)
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
}

internal sealed class ShortcutOutput
{
    private readonly Dictionary<string, ushort[]> owners = new();
    private readonly List<ushort> physicallyDown = [];

    public string[] HeldNames => owners.Keys.OrderBy(x => x).ToArray();
    public bool HasDown => physicallyDown.Count > 0;
    public bool IsHolding => owners.Count > 0;

    public void SetHold(string owner, ushort[] keys, bool desired)
    {
        if (desired && keys.Length > 0) owners[owner] = keys;
        else owners.Remove(owner);
        Reconcile();
    }

    public void Tap(ushort[] keys)
    {
        if (keys.Length == 0) return;
        var pressed = new List<ushort>();
        try
        {
            foreach (ushort key in keys)
            {
                if (physicallyDown.Contains(key)) continue;
                ShortcutKeys.Send(key, true);
                physicallyDown.Add(key);
                pressed.Add(key);
            }
        }
        finally
        {
            for (int i = pressed.Count - 1; i >= 0; i--)
            {
                ushort key = pressed[i];
                if (owners.Values.Any(value => value.Contains(key))) continue;
                ShortcutKeys.Send(key, false);
                physicallyDown.Remove(key);
            }
        }
    }

    public void ReleaseAll()
    {
        owners.Clear();
        Reconcile();
    }

    public void Reconcile()
    {
        var desired = owners.Values.SelectMany(x => x).ToHashSet();
        foreach (ushort key in physicallyDown.Where(k => !desired.Contains(k)).Reverse().ToArray())
        {
            ShortcutKeys.Send(key, false);
            physicallyDown.Remove(key);
        }
        foreach (ushort key in owners.Values.SelectMany(x => x).Distinct().Where(k => !physicallyDown.Contains(k)))
        {
            ShortcutKeys.Send(key, true);
            physicallyDown.Add(key);
        }
    }
}
