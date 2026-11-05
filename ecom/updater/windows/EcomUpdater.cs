// Copyright 2026 The Ecom Authors. MPL-2.0.
// Uses the Windows inbox .NET Framework; no Node.js or npm runtime is required.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace EcomUpdate {
  static class Program {
    internal const string Package = "@petercjl/ecom-windows-x64";
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2000000 };
    internal static readonly string State = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ecom", "UpdateState");
    static readonly Dictionary<string,string> Args = new Dictionary<string,string>();
    static string AppDir, Profile, NativeDir, QuitEvent;
    static int Parent;
    static Dictionary<string,object> Installed;

    [STAThread] static int Main(string[] args) {
      try {
        for(int i=0;i<args.Length;i++) {
          string key=args[i]; Require(key.StartsWith("--"),"Invalid argument");
          int equal=key.IndexOf('=');
          if(equal>2) Args.Add(key.Substring(2,equal-2),key.Substring(equal+1));
          else Args.Add(key.Substring(2),i+1<args.Length && !args[i+1].StartsWith("--") ? args[++i] : "true");
        }
        if(Args.ContainsKey("self-test")) { SelfTest(); return 0; }
        PrivateDirectory(State);
        if(Args.ContainsKey("verify-payload")) {
          string work=Path.Combine(State,"verification",Guid.NewGuid().ToString("N"));PrivateDirectory(work);
          try {Require(!File.Exists(Get("report")),"Verification report already exists");VerifyIntegrity(Get("verify-payload"),Get("integrity"));Extract(Get("verify-payload"),work);var manifest=ValidatePayload(work,new Dictionary<string,object>{{"version",Get("version")}});AtomicJson(Get("report"),manifest);}
          finally {Directory.Delete(work,true);}return 0;
        }
        if(Args.ContainsKey("apply")) { Apply(ReadObject(Args["apply"])); return 0; }
        if(Args.ContainsKey("recover")) {
          string app=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application");
          if(Application.ExecutablePath.StartsWith(app+"\\",StringComparison.OrdinalIgnoreCase)) {
            string work=Path.Combine(State,"staging",Guid.NewGuid().ToString("N"));PrivateDirectory(work);string helper=Path.Combine(work,"EcomUpdateWorker.exe");File.Copy(Application.ExecutablePath,helper,false);Process.Start(helper,"--recover");
          }else RecoverPending();return 0;
        }
        AppDir=Path.GetFullPath(Get("app"));
        string expected=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application");
        Require(Same(AppDir,expected),"Only the current user's Ecom installation can be updated");
        string exe=Path.Combine(AppDir,"Ecom.exe");
        Require(File.Exists(exe),"Ecom is not installed");
        NativeDir=Path.Combine(AppDir,FileVersionInfo.GetVersionInfo(exe).FileVersion);
        Installed=ReadObject(Path.Combine(NativeDir,"ecom-update.json")); ValidateIdentity(Installed);
        Profile=Path.GetFullPath(Get("profile"));
        Parent=int.Parse(Get("pid")); QuitEvent=Get("quit-event");
        Require(Same(Process.GetProcessById(Parent).MainModule.FileName,exe),"Browser process does not match the installation");
        Require(Regex.IsMatch(QuitEvent,@"^Local\\EcomUpdateQuit\.[a-f0-9-]{36}$"),"Invalid browser exit event");
        using(EventWaitHandle.OpenExisting(QuitEvent,EventWaitHandleRights.Synchronize)) {}
        string ticketPath=Path.Combine(State,"running-"+Parent+".json");
        // Only the browser's native startup invokes this route. Replace our own
        // transient readiness receipt atomically; no profile files are modified.
        AtomicJson(ticketPath,new Dictionary<string,object>{{"pid",Parent},{"version",S(Installed,"version")},{"sourceRevision",S(Installed,"sourceRevision")},{"quitEvent",QuitEvent}});
        bool created;
        using(var mutex=new Mutex(true,"Local\\EcomUpdater."+HashText(AppDir).Substring(0,24),out created)) {
          if(!created) return 0;
          Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
          var panel=new UpdateForm(Args.ContainsKey("watch")); Application.Run(panel);
        }
        return 0;
      } catch(Exception error) {
        try { PrivateDirectory(State); AtomicJson(Path.Combine(State,"last-error.json"),new Dictionary<string,object>{{"error",error.Message},{"time",DateTime.UtcNow.ToString("o")}}); } catch {}
        if(!Args.ContainsKey("watch") && !Args.ContainsKey("self-test") && !Args.ContainsKey("verify-payload")) MessageBox.Show(error.Message,"Ecom 更新",MessageBoxButtons.OK,MessageBoxIcon.Error);
        return 1;
      }
    }

    internal static void Require(bool condition,string message) { if(!condition) throw new InvalidDataException(message); }
    static string Get(string key) { Require(Args.ContainsKey(key),"Missing argument: "+key); return Args[key]; }
    internal static string S(Dictionary<string,object> obj,string key) { object value; Require(obj.TryGetValue(key,out value) && value is string,"Missing string: "+key); return (string)value; }
    static long N(Dictionary<string,object> obj,string key) { return Convert.ToInt64(obj[key]); }
    internal static Dictionary<string,object> ReadObject(string file) { return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file,Encoding.UTF8)); }
    static bool Same(string a,string b) { return string.Equals(Path.GetFullPath(a).TrimEnd('\\'),Path.GetFullPath(b).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase); }
    static string Hex(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant(); }
    internal static string Hash(string file) { using(var h=SHA256.Create()) using(var s=File.OpenRead(file)) return Hex(h.ComputeHash(s)); }
    static string HashText(string text) { using(var h=SHA256.Create()) return Hex(h.ComputeHash(Encoding.UTF8.GetBytes(text))); }
    static void PrivateDirectory(string path) {
      Directory.CreateDirectory(path);
      Require((File.GetAttributes(path)&FileAttributes.ReparsePoint)==0,"Reparse directory rejected");
      var acl=new DirectorySecurity(); acl.SetAccessRuleProtection(true,false);
      var user=WindowsIdentity.GetCurrent().User;
      acl.SetOwner(user);
      foreach(var sid in new[]{user,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})
        acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
      Directory.SetAccessControl(path,acl);
    }
    static void AtomicJson(string file,Dictionary<string,object> value) {
      string temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";
      using(var s=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
        byte[] data=Encoding.UTF8.GetBytes(Json.Serialize(value));s.Write(data,0,data.Length);s.Flush(true);
      }
      if(File.Exists(file)) { Require((File.GetAttributes(file)&FileAttributes.ReparsePoint)==0,"Reparse file rejected"); File.Replace(temp,file,file+".previous",true); }
      else File.Move(temp,file);
    }
    static void ValidateIdentity(Dictionary<string,object> value) {
      Require(N(value,"schemaVersion")==1 && N(value,"updateProtocol")==1 && S(value,"packageName")==Package && S(value,"platform")=="win32" && S(value,"arch")=="x64" && S(value,"appName")=="Ecom.exe" && S(value,"signing")=="unsigned","Unsupported Windows release identity");
      ParseVersion(S(value,"version"));
      Require(Regex.IsMatch(S(value,"sourceRevision"),"^[a-f0-9]{40}$"),"Invalid native revision");
    }
    static Version ParseVersion(string version) { Require(Regex.IsMatch(version,@"^\d+\.\d+\.\d+$"),"Invalid release version");return new Version(version); }
    static bool Allowed(Uri uri) { return uri.Scheme=="https" && uri.Host=="registry.npmjs.org" && uri.Port==443 && uri.UserInfo==""; }
    static HttpWebResponse Open(Uri uri) {
      Require(Allowed(uri),"Untrusted registry URL");
      ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
      var request=(HttpWebRequest)WebRequest.Create(uri);request.AllowAutoRedirect=false;request.Timeout=30000;request.ReadWriteTimeout=60000;request.UserAgent="EcomUpdater/1";
      var response=(HttpWebResponse)request.GetResponse();
      if(response.StatusCode!=HttpStatusCode.OK) {response.Dispose();throw new IOException("Unexpected registry response");}
      return response;
    }
    static Dictionary<string,object> Metadata(string channel) {
      Require(channel=="next" || channel=="latest","Invalid channel");
      using(var r=Open(new Uri("https://registry.npmjs.org/@petercjl%2fecom-windows-x64/"+channel)))
      using(var input=r.GetResponseStream()) using(var output=new MemoryStream()) {
        CopyBounded(input,output,1500000,null);return Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(output.ToArray()));
      }
    }
    static void CopyBounded(Stream input,Stream output,long maximum,Action<long> progress) {
      byte[] buffer=new byte[65536];long total=0;int n;
      while((n=input.Read(buffer,0,buffer.Length))!=0) {total+=n;Require(total<=maximum,"Download exceeds size limit");output.Write(buffer,0,n);if(progress!=null)progress(total);}
    }
    internal static void VerifyIntegrity(string file,string integrity) {
      Require(Regex.IsMatch(integrity,@"^sha512-[A-Za-z0-9+/]{86}==$"),"Registry integrity is required");
      using(var hash=SHA512.Create()) using(var stream=File.OpenRead(file))
        Require("sha512-"+Convert.ToBase64String(hash.ComputeHash(stream))==integrity,"npm package integrity mismatch");
    }
    static void ReadExactly(Stream stream,byte[] buffer,int count) { int at=0,n;while(at<count && (n=stream.Read(buffer,at,count-at))>0) at+=n;Require(at==count,"Truncated tar archive"); }
    internal static void Extract(string tgz,string destination) {
      var expected=new HashSet<string>(new[]{"package/package.json","package/artifact.json","package/LICENSE","package/EcomSetup.exe"});
      long expanded=0;
      using(var file=File.OpenRead(tgz)) using(var tar=new GZipStream(file,CompressionMode.Decompress)) {
        var header=new byte[512];
        for(;;) {
          ReadExactly(tar,header,512);
          if(header.All(b=>b==0)) {byte[] tail=new byte[65536];int n;long padding=0;while((n=tar.Read(tail,0,tail.Length))>0){padding+=n;Require(padding<65536 && tail.Take(n).All(b=>b==0),"Unexpected tar trailer");}break;}
          long checksum=0;for(int i=0;i<512;i++)checksum+=(i>=148 && i<156)?32:header[i];
          Require(Convert.ToInt64(Encoding.ASCII.GetString(header,148,8).Trim('\0',' '),8)==checksum,"Invalid tar checksum");
          string name=Encoding.ASCII.GetString(header,0,100).TrimEnd('\0');
          Require(header[156]==0 || header[156]==(byte)'0',"Archive links and special entries are rejected");
          Require(header.Skip(345).Take(155).All(b=>b==0) && expected.Remove(name),"Unexpected or duplicate archive entry");
          long size=Convert.ToInt64(Encoding.ASCII.GetString(header,124,12).Trim('\0',' '),8);expanded+=size;
          Require(size>=0 && expanded<=390000000 && (name.EndsWith(".exe") || size<=1000000),"Invalid archive entry size");
          string target=Path.Combine(destination,Path.GetFileName(name));
          using(var output=new FileStream(target,FileMode.CreateNew)) {
            byte[] buf=new byte[65536];long left=size;while(left>0){int count=(int)Math.Min(buf.Length,left);ReadExactly(tar,buf,count);output.Write(buf,0,count);left-=count;}
          }
          long pad=(512-size%512)%512;if(pad>0){var bytes=new byte[(int)pad];ReadExactly(tar,bytes,bytes.Length);Require(bytes.All(b=>b==0),"Invalid tar padding");}
        }
      }
      Require(expected.Count==0,"Incomplete npm payload");
    }
    static Dictionary<string,object> ValidatePayload(string work,Dictionary<string,object> metadata) {
      var pkg=ReadObject(Path.Combine(work,"package.json"));var artifact=ReadObject(Path.Combine(work,"artifact.json"));ValidateIdentity(artifact);
      Require(S(pkg,"name")==Package && S(pkg,"version")==S(metadata,"version") && S(artifact,"version")==S(metadata,"version") && !pkg.ContainsKey("scripts") && !pkg.ContainsKey("dependencies"),"Unexpected payload identity");
      Require(S(artifact,"archive")=="EcomSetup.exe","Invalid installer name");
      string installer=Path.Combine(work,"EcomSetup.exe");
      Require(new FileInfo(installer).Length==N(artifact,"archiveBytes") && Hash(installer)==S(artifact,"archiveSha256"),"Installer integrity mismatch");
      foreach(string key in new[]{"exeSha256","frameworkSha256","updaterSha256"})Require(Regex.IsMatch(S(artifact,key),"^[a-f0-9]{64}$"),"Invalid installed artifact hash");
      return artifact;
    }
    static string Channel() {
      string file=Path.Combine(State,"channel.json");if(!File.Exists(file))return "latest";
      string value=S(ReadObject(file),"channel");Require(value=="latest" || value=="next","Invalid saved channel");return value;
    }

    sealed class UpdateForm : Form {
      readonly Label status=new Label();readonly ComboBox channel=new ComboBox();readonly Button check=new Button();readonly Button download=new Button();readonly Button rollback=new Button();
      Dictionary<string,object> candidate;readonly bool automatic;
      public UpdateForm(bool automatic) {
        this.automatic=automatic;Text="Ecom 更新";ClientSize=new Size(490,220);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        var label=new Label{Text="当前版本："+S(Installed,"version")+"   Windows x64",AutoSize=true,Location=new Point(20,20)};
        var cl=new Label{Text="更新渠道",AutoSize=true,Location=new Point(20,55)};
        channel.DropDownStyle=ComboBoxStyle.DropDownList;channel.Items.AddRange(new object[]{"latest","next"});channel.SelectedItem=Channel();channel.Location=new Point(100,50);
        check.Text="检查更新";check.Location=new Point(310,49);check.Size=new Size(150,30);
        status.SetBounds(20,98,450,50);status.Text="准备检查更新。";
        download.Text="下载更新";download.SetBounds(310,162,150,32);download.Enabled=false;
        rollback.Text="恢复上一版本";rollback.SetBounds(20,162,150,32);rollback.Enabled=File.Exists(Path.Combine(State,"rollback.json"));
        Controls.AddRange(new Control[]{label,cl,channel,check,status,download,rollback});
        channel.SelectedIndexChanged+=(s,e)=>{candidate=null;download.Enabled=false;AtomicJson(Path.Combine(State,"channel.json"),new Dictionary<string,object>{{"channel",channel.SelectedItem.ToString()}});status.Text="已选择 "+channel.SelectedItem+"，请检查更新。";};
        check.Click+=async(s,e)=>await Check();download.Click+=async(s,e)=>await Download();
        rollback.Click+=(s,e)=>{if(MessageBox.Show("恢复上一版本会退出并重新启动 Ecom。账号及用户数据会保留。是否继续？","Ecom 更新",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes) StartWorker(null,true);};
        Shown+=async(s,e)=>{if(automatic){Hide();await Check();if(candidate==null)Close();else {Show();Activate();}}else await Check();};
      }
      async Task Check() {
        check.Enabled=false;channel.Enabled=false;download.Enabled=false;candidate=null;status.Text="正在检查 "+channel.SelectedItem+"…";
        try {
          string selected=channel.SelectedItem.ToString();var metadata=await Task.Run(()=>Metadata(selected));
          Require(S(metadata,"name")==Package,"Unexpected package name");
          if(ParseVersion(S(metadata,"version"))>ParseVersion(S(Installed,"version"))) {candidate=metadata;download.Enabled=true;status.Text="可更新到 "+S(metadata,"version")+"（"+selected+"）。点击下载后才会传输更新包。";}
          else status.Text="当前渠道没有更新。当前版本："+S(Installed,"version");
        }catch(Exception error){status.Text="检查失败："+error.Message;}
        finally{check.Enabled=true;channel.Enabled=true;}
      }
      async Task Download() {
        download.Enabled=false;check.Enabled=false;channel.Enabled=false;rollback.Enabled=false;
        string work=Path.Combine(State,"staging",Guid.NewGuid().ToString("N"));PrivateDirectory(work);
        try {
          var dist=(Dictionary<string,object>)candidate["dist"];string tgz=Path.Combine(work,"payload.tgz");
          string integrity=S(dist,"integrity");var url=new Uri(S(dist,"tarball"));
          var progress=new Progress<long>(n=>status.Text="正在下载："+(n/1048576)+" MiB");
          await Task.Run(()=>{using(var response=Open(url)) using(var input=response.GetResponseStream()) using(var output=new FileStream(tgz,FileMode.CreateNew)){Require(response.ContentLength<=390000000,"Package too large");CopyBounded(input,output,390000000,n=>((IProgress<long>)progress).Report(n));}VerifyIntegrity(tgz,integrity);Extract(tgz,work);ValidatePayload(work,candidate);});
          status.Text="更新包完整性校验通过，等待确认安装。";
          if(MessageBox.Show("更新包已下载并通过校验。现在退出 Ecom、更新到 "+S(candidate,"version")+" 并重新启动？账号及用户数据会保留。","Ecom 更新",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes) {
            var job=new Dictionary<string,object>{{"work",work},{"metadata",candidate},{"integrity",integrity}};StartWorker(job,false);
          }
        }catch(Exception error){status.Text="更新未应用："+error.Message;}
        finally{check.Enabled=true;channel.Enabled=true;rollback.Enabled=File.Exists(Path.Combine(State,"rollback.json"));}
      }
      void StartWorker(Dictionary<string,object> job,bool restore) {
        string work=job==null?Path.Combine(State,"staging",Guid.NewGuid().ToString("N")):S(job,"work");PrivateDirectory(work);
        if(job==null) job=new Dictionary<string,object>();
        job["app"]=AppDir;job["profile"]=Profile;job["pid"]=Parent;job["quitEvent"]=QuitEvent;job["rollback"]=restore;
        string worker=Path.Combine(work,"EcomUpdateWorker.exe");File.Copy(Application.ExecutablePath,worker,false);
        string file=Path.Combine(work,"job.json");AtomicJson(file,job);
        Process.Start(new ProcessStartInfo(worker,"--apply "+Quote(file)){UseShellExecute=false});Close();
      }
    }
    static string Quote(string value) { Require(value.IndexOf('"')<0 && !value.EndsWith("\\"),"Invalid path argument");return "\""+value+"\""; }
    static string RelaunchArguments(string profile) { return "--user-data-dir="+Quote(profile)+" --restore-last-session"; }
    static void CloseBrowser(int pid,string app,string quitEvent) {
      Process process=null;try{process=Process.GetProcessById(pid);}catch(ArgumentException){}
      if(process!=null) {
        Require(Same(process.MainModule.FileName,Path.Combine(app,"Ecom.exe")),"Browser identity changed");
        using(var evt=EventWaitHandle.OpenExisting(quitEvent,EventWaitHandleRights.Modify))evt.Set();
        Require(process.WaitForExit(60000),"Ecom has not exited. Existing installation retained; finish any open dialogs and retry.");
      }
      EnsureNoBrowser(app,10000);
    }
    static void EnsureNoBrowser(string app,int graceMilliseconds=0) {
      var timer=Stopwatch.StartNew();
      while(true) {
        bool remaining=false;
        foreach(var p in Process.GetProcessesByName("Ecom"))using(p)try{if(Same(p.MainModule.FileName,Path.Combine(app,"Ecom.exe")))remaining=true;}catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){if(!p.HasExited)throw new IOException("Cannot verify remaining Ecom processes");}
        if(!remaining)return;
        Require(timer.ElapsedMilliseconds<graceMilliseconds,"Another Ecom instance still uses this installation");Thread.Sleep(100);
      }
    }
    static void CopyTree(string source,string destination) {
      Require(!Directory.Exists(destination),"Backup target exists");Directory.CreateDirectory(destination);
      foreach(string entry in Directory.GetFileSystemEntries(source)) {
        var attr=File.GetAttributes(entry);Require((attr&FileAttributes.ReparsePoint)==0,"Application reparse point rejected");
        string target=Path.Combine(destination,Path.GetFileName(entry));
        if((attr&FileAttributes.Directory)!=0)CopyTree(entry,target);else {File.Copy(entry,target,false);Require(Hash(entry)==Hash(target),"Backup verification failed");}
      }
    }
    static string VersionDirectory(string app) { return Path.Combine(app,FileVersionInfo.GetVersionInfo(Path.Combine(app,"Ecom.exe")).FileVersion); }
    static void ValidateInstalled(string app,Dictionary<string,object> artifact) {
      string version=VersionDirectory(app);var identity=ReadObject(Path.Combine(version,"ecom-update.json"));ValidateIdentity(identity);
      Require(S(identity,"version")==S(artifact,"version") && S(identity,"sourceRevision")==S(artifact,"sourceRevision"),"Installed release identity mismatch");
      Require(Hash(Path.Combine(app,"Ecom.exe"))==S(artifact,"exeSha256") && Hash(Path.Combine(version,"chrome.dll"))==S(artifact,"frameworkSha256") && Hash(Path.Combine(version,"EcomUpdater.exe"))==S(artifact,"updaterSha256"),"Installed program differs from verified payload");
    }
    const string UninstallKey=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Ecom";
    static Dictionary<string,object> CaptureRegistration() {
      var values=new Dictionary<string,object>();
      using(var key=Registry.CurrentUser.OpenSubKey(UninstallKey)) {
        Require(key!=null,"Ecom uninstall registration is missing");
        foreach(string name in key.GetValueNames()) {
          var kind=key.GetValueKind(name);object value=key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);
          if(kind==RegistryValueKind.Binary)value=Convert.ToBase64String((byte[])value);
          values[name]=new Dictionary<string,object>{{"kind",kind.ToString()},{"value",value}};
        }
      }
      return values;
    }
    static void RestoreRegistration(Dictionary<string,object> values) {
      using(var key=Registry.CurrentUser.CreateSubKey(UninstallKey)) {
        foreach(string name in key.GetValueNames())if(!values.ContainsKey(name))key.DeleteValue(name,false);
        foreach(var entry in values) {
          var saved=(Dictionary<string,object>)entry.Value;var kind=(RegistryValueKind)Enum.Parse(typeof(RegistryValueKind),S(saved,"kind"));object value=saved["value"];
          if(kind==RegistryValueKind.DWord)value=Convert.ToInt32(value);
          if(kind==RegistryValueKind.QWord)value=Convert.ToInt64(value);
          if(kind==RegistryValueKind.Binary)value=Convert.FromBase64String((string)value);
          if(kind==RegistryValueKind.MultiString)value=((System.Collections.IEnumerable)value).Cast<object>().Select(v=>(string)v).ToArray();
          key.SetValue(entry.Key,value,kind);
        }
      }
    }
    static Process Restart(string app,string profile,string expectedVersion,Action<Process> started=null) {
      DateTime startedAt=DateTime.UtcNow;
      var process=Process.Start(new ProcessStartInfo(Path.Combine(app,"Ecom.exe"),RelaunchArguments(profile)){UseShellExecute=false});
      if(started!=null)started(process);
      string ready=Path.Combine(State,"running-"+process.Id+".json");var timer=Stopwatch.StartNew();
      double stableSince=-1;
      while(timer.Elapsed.TotalSeconds<45) {
        if(process.HasExited)throw new IOException("Updated Ecom exited before readiness");
        process.Refresh();bool healthy=false;
        if(File.Exists(ready)&&File.GetLastWriteTimeUtc(ready)>=startedAt) {
          var info=ReadObject(ready);
          healthy=N(info,"pid")==process.Id&&S(info,"version")==expectedVersion&&process.MainWindowHandle!=IntPtr.Zero;
        }
        if(healthy){if(stableSince<0)stableSince=timer.Elapsed.TotalSeconds;if(timer.Elapsed.TotalSeconds-stableSince>=10)return process;}
        else stableSince=-1;
        Thread.Sleep(250);
      }
      throw new IOException("Updated Ecom did not report startup readiness; recovery is retained");
    }
    static void Restore(Dictionary<string,object> recovery) {
      string app=S(recovery,"app"),backup=S(recovery,"backup");
      Require(Same(app,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application")) && backup.StartsWith(State+"\\",StringComparison.OrdinalIgnoreCase),"Invalid recovery target");
      EnsureNoBrowser(app);
      Require(Directory.Exists(backup) && File.Exists(Path.Combine(backup,"Ecom.exe")),"Recovery copy unavailable");
      Require(Hash(Path.Combine(backup,"Ecom.exe"))==S(recovery,"exeSha256") && Hash(Path.Combine(VersionDirectory(backup),"chrome.dll"))==S(recovery,"frameworkSha256"),"Recovery program integrity mismatch");
      Require(Hash(Path.Combine(VersionDirectory(backup),"ecom-update.json"))==S(recovery,"metadataSha256") && Hash(Path.Combine(VersionDirectory(backup),"EcomUpdater.exe"))==S(recovery,"updaterSha256"),"Recovery metadata or helper integrity mismatch");
      if(Directory.Exists(app))Directory.Move(app,app+".failed-"+Guid.NewGuid().ToString("N"));
      // Retain the verified backup for another recovery attempt if interrupted.
      CopyTree(backup,app);
      RestoreRegistration((Dictionary<string,object>)recovery["registration"]);
      AtomicJson(Path.Combine(State,"last-result.json"),new Dictionary<string,object>{{"status","rolled-back"},{"version",S(recovery,"version")},{"backup",backup}});
    }
    static void RecoverPending() {
      var pending=ReadObject(Path.Combine(State,"pending.json"));
      Require(S(pending,"status")=="installing","No interrupted installation to recover");
      string app=S(pending,"app");
      Require(!Process.GetProcessesByName("Ecom").Any(p=>{try{return Same(p.MainModule.FileName,Path.Combine(app,"Ecom.exe"));}catch{return true;}}),"Close Ecom before recovery");
      Restore(pending);Restart(app,S(pending,"profile"),S(pending,"version"));
    }
    static void Apply(Dictionary<string,object> job) {
      string app=Path.GetFullPath(S(job,"app")),profile=Path.GetFullPath(S(job,"profile"));
      Require(Same(app,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application")),"Unsupported installation target");
      using(var guard=new FileStream(Path.Combine(State,"apply.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
        bool rollback=Convert.ToBoolean(job["rollback"]);Dictionary<string,object> artifact=null;
        if(!rollback) {string work=S(job,"work");Require(work.StartsWith(Path.Combine(State,"staging")+"\\",StringComparison.OrdinalIgnoreCase),"Invalid staging directory");VerifyIntegrity(Path.Combine(work,"payload.tgz"),S(job,"integrity"));artifact=ValidatePayload(work,(Dictionary<string,object>)job["metadata"]);Require(ParseVersion(S(artifact,"version"))>ParseVersion(S(ReadObject(Path.Combine(VersionDirectory(app),"ecom-update.json")),"version")),"Update is no longer newer");}
        CloseBrowser((int)N(job,"pid"),app,S(job,"quitEvent"));
        if(rollback) {var recovery=ReadObject(Path.Combine(State,"rollback.json"));Restore(recovery);Restart(app,profile,S(recovery,"version"));return;}
        string backup=Path.Combine(State,"backups",Guid.NewGuid().ToString("N"));PrivateDirectory(Path.GetDirectoryName(backup));CopyTree(app,backup);
        var previous=ReadObject(Path.Combine(VersionDirectory(app),"ecom-update.json"));
        var record=new Dictionary<string,object>{{"app",app},{"backup",backup},{"version",S(previous,"version")},{"profile",profile},{"exeSha256",Hash(Path.Combine(app,"Ecom.exe"))},{"frameworkSha256",Hash(Path.Combine(VersionDirectory(app),"chrome.dll"))},{"metadataSha256",Hash(Path.Combine(VersionDirectory(app),"ecom-update.json"))},{"updaterSha256",Hash(Path.Combine(VersionDirectory(app),"EcomUpdater.exe"))},{"status","installing"}};
        record["registration"]=CaptureRegistration();
        AtomicJson(Path.Combine(State,"pending.json"),record);
        Process launched=null;
        try {
          using(var installer=Process.Start(new ProcessStartInfo(Path.Combine(S(job,"work"),"EcomSetup.exe"),"--do-not-launch-chrome"){UseShellExecute=false})) {
            Require(installer.WaitForExit(600000),"Installer still running; recovery deferred until it exits");Require(installer.ExitCode==0,"Installer failed: "+installer.ExitCode);
          }
          ValidateInstalled(app,artifact);EnsureNoBrowser(app);Restart(app,profile,S(artifact,"version"),p=>launched=p);
          AtomicJson(Path.Combine(State,"rollback.json"),record);record["status"]="complete";AtomicJson(Path.Combine(State,"pending.json"),record);
          AtomicJson(Path.Combine(State,"last-result.json"),new Dictionary<string,object>{{"status","updated"},{"version",S(artifact,"version")},{"sourceRevision",S(artifact,"sourceRevision")},{"pid",launched.Id},{"backup",backup}});
        } catch {
          if(launched!=null && !launched.HasExited) {string ready=Path.Combine(State,"running-"+launched.Id+".json");Require(File.Exists(ready),"Startup outcome unknown; quit Ecom and run recovery");CloseBrowser(launched.Id,app,S(ReadObject(ready),"quitEvent"));}
          Require(!Process.GetProcessesByName("mini_installer").Any() && !Process.GetProcessesByName("setup").Any(),"Installer outcome unknown; recovery deferred");
          Restore(record);Restart(app,profile,S(previous,"version"));throw;
        }
      }
    }

    static void SelfTest() {
      Require(ParseVersion("0.1.1")>ParseVersion("0.1.0"),"Version comparison");
      Require(RelaunchArguments(@"C:\Users\Test User\Ecom") == "--user-data-dir=\"C:\\Users\\Test User\\Ecom\" --restore-last-session","Profile and tab restoration arguments");
      foreach(string bad in new[]{"0.1.0-next.1","../1.2.3","1.2","-1.2.3"}) {bool failed=false;try{ParseVersion(bad);}catch{failed=true;}Require(failed,"Invalid version accepted");}
      Require(Allowed(new Uri("https://registry.npmjs.org/x")),"Registry host");
      foreach(string bad in new[]{"http://registry.npmjs.org/x","https://registry.npmjs.org.evil.test/x","https://u:p@registry.npmjs.org/x","https://registry.npmjs.org:444/x"})Require(!Allowed(new Uri(bad)),"Untrusted URL accepted");
      string work=Path.Combine(Path.GetTempPath(),"EcomUpdaterTests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(work);
      try {
        string payload=Path.Combine(work,"test.bin");File.WriteAllText(payload,"Ecom integrity test");string integrity;using(var h=SHA512.Create())using(var f=File.OpenRead(payload))integrity="sha512-"+Convert.ToBase64String(h.ComputeHash(f));VerifyIntegrity(payload,integrity);
        File.AppendAllText(payload,"corrupt");bool rejected=false;try{VerifyIntegrity(payload,integrity);}catch{rejected=true;}Require(rejected,"Corruption accepted");
        int index=0;
        foreach(var item in new[]{Tuple.Create("package/../../escaped",(byte)'0'),Tuple.Create("package/package.json",(byte)'2'),Tuple.Create("package/package.json",(byte)'1')}) {
          string tgz=Path.Combine(work,"malicious-"+(index++)+".tgz");TarFixture(tgz,item.Item1,item.Item2);
          string target=Path.Combine(work,"extract-"+index);Directory.CreateDirectory(target);
          bool failed=false;try{Extract(tgz,target);}catch{failed=true;}Require(failed,"Unsafe tar archive accepted");
        }
        Require(!File.Exists(Path.Combine(work,"escaped")),"Archive escaped extraction directory");
        File.WriteAllText(Path.Combine(work,"self-test.json"),"{\"ok\":true,\"checks\":[\"semver\",\"registry-origin\",\"sha512-corruption\",\"tar-traversal\",\"tar-symlinks\",\"tar-hardlinks\"]}");
        if(Args.ContainsKey("report")){using(var f=new FileStream(Args["report"],FileMode.CreateNew)) {byte[] data=Encoding.UTF8.GetBytes(File.ReadAllText(Path.Combine(work,"self-test.json")));f.Write(data,0,data.Length);}}
      }finally{Directory.Delete(work,true);}
    }
    static void TarFixture(string file,string name,byte type) {
      var header=new byte[512];byte[] text=Encoding.ASCII.GetBytes(name);Array.Copy(text,header,text.Length);
      byte[] size=Encoding.ASCII.GetBytes("00000000000\0");Array.Copy(size,0,header,124,size.Length);header[156]=type;
      for(int i=148;i<156;i++)header[i]=32;
      long sum=header.Sum(b=>(long)b);byte[] checksum=Encoding.ASCII.GetBytes(Convert.ToString(sum,8).PadLeft(6,'0')+"\0 ");Array.Copy(checksum,0,header,148,8);
      using(var output=new FileStream(file,FileMode.CreateNew))using(var gz=new GZipStream(output,CompressionMode.Compress)){gz.Write(header,0,512);gz.Write(new byte[1024],0,1024);}
    }
  }
}
