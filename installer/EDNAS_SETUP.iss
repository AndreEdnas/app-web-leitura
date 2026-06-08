#define MyAppName "EDNAS Leitura"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "EDNAS"
#define MyAppExeName "installer\\install-client.ps1"

[Setup]
AppId={{D6E0C97F-66F8-4E6C-9C1F-2E0CF4A8A123}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\EdnasLeitura
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=EDNAS_Leitura_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
Source: "..\dist\ednas-client\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Configurar EDNAS"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoExit -File ""{app}\{#MyAppExeName}"" -InstallDir ""{app}"" -SkipCopy -PromptValues"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoExit -File ""{app}\{#MyAppExeName}"" -InstallDir ""{app}"" -SkipCopy -PromptValues"; StatusMsg: "A configurar EDNAS..."
