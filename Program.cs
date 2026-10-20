namespace GestureF13;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var singleInstance = new Mutex(true, @"Local\GestureShortcutMvp", out bool createdNew);
        if (!createdNew)
        {
            MessageBox.Show("Gesture Shortcut は既に起動しています。通知領域を確認してください。",
                "Gesture Shortcut", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        using var form = new MainForm();
        AppDomain.CurrentDomain.UnhandledException += (_, _) => form.EmergencyRelease();
        Application.ThreadException += (_, e) =>
        {
            form.EmergencyRelease();
            MessageBox.Show(e.Exception.Message, "アプリを終了します", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Application.Exit();
        };
        try { Application.Run(form); }
        finally { form.EmergencyRelease(); }
    }
}
