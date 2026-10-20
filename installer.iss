; Build: dotnet publish -c Release -r win-x64 --self-contained false -o <AppDir>
;        ISCC.exe /DAppDir=<AppDir> /DOutDir=<OutDir> installer.iss
#define AppVersion "1.0.0"

[Setup]
AppId={{6B1E0F5A-2C4D-4E8B-9A57-3F0C1D2E4B61}
AppName=Gesture Shortcut
AppVersion={#AppVersion}
AppPublisher=masa-dev-2000
AppPublisherURL=https://github.com/masa-dev-2000/gesture-f13
DefaultDirName={localappdata}\Programs\Gesture Shortcut
DefaultGroupName=Gesture Shortcut
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=GestureShortcut-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=LICENSE
UninstallDisplayIcon={app}\GestureF13.exe

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#AppDir}\*"; Excludes: "*.pdb,*.xml"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\Gesture Shortcut"; Filename: "{app}\GestureF13.exe"
Name: "{group}\{cm:UninstallProgram,Gesture Shortcut}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Gesture Shortcut"; Filename: "{app}\GestureF13.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\GestureF13.exe"; Description: "{cm:LaunchProgram,Gesture Shortcut}"; Flags: nowait postinstall skipifsilent
