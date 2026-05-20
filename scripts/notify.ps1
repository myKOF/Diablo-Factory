[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$toastXml = [xml]$template.GetXml()
$toastXml.GetElementsByTagName("text")[0].AppendChild($toastXml.CreateTextNode("Antigravity System")) | Out-Null
$toastXml.GetElementsByTagName("text")[1].AppendChild($toastXml.CreateTextNode("Task Completed!")) | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($toastXml.OuterXml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Diablo-Factory").Show($toast)

try {
    (New-Object Media.SoundPlayer "C:\Windows\Media\notify.wav").PlaySync()
} catch {}
