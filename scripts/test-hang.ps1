# test-hang.ps1 - Compiles and launches a real Windows GUI app that freezes
# so that Windows Error Reporting logs Event ID 1002 (Application Hang).
#
# Steps:
#   1. Start a Black Box recording session
#   2. Run this script
#   3. When the title bar says "Not Responding" - press the issue marker in Black Box
#   4. Open Task Manager, find BlackBoxHangTest.exe, right-click -> End Task
#      (Windows logs Event 1002 when the process is terminated, not just when it freezes)
#   5. Stop the Black Box recording

$source = @"
using System;
using System.Windows.Forms;
using System.Threading;

public class Program {
    [STAThread]
    public static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        Form form = new Form();
        form.Text = "Black Box Test";
        form.Width = 340;
        form.Height = 120;
        form.StartPosition = FormStartPosition.CenterScreen;

        Label lbl = new Label();
        lbl.Text = "Freezing in 2 seconds - watch the title bar...";
        lbl.Dock = DockStyle.Fill;
        lbl.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
        lbl.Font = new System.Drawing.Font("Consolas", 10);
        form.Controls.Add(lbl);

        System.Windows.Forms.Timer t = new System.Windows.Forms.Timer();
        t.Interval = 2000;
        t.Tick += (s, e) => {
            t.Stop();
            Thread.Sleep(120000);
        };
        t.Start();

        Application.Run(form);
    }
}
"@

$exePath = "$env:TEMP\BlackBoxHangTest.exe"

Write-Host "Compiling test app..."
Add-Type -TypeDefinition $source `
         -OutputAssembly $exePath `
         -OutputType WindowsApplication `
         -ReferencedAssemblies "System.Windows.Forms", "System.Drawing"

Write-Host "Launching - title bar will show 'Not Responding' after ~5 seconds of freeze."
Start-Process $exePath
