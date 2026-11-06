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
  internal sealed class DownloadProgressView : Panel {
    readonly Label heading=new Label(),percentage=new Label(),amount=new Label();
    readonly ProgressBar meter=new ProgressBar();
    internal DownloadProgressView() {
      Size=new Size(490,220);Font=SystemFonts.MessageBoxFont;BackColor=SystemColors.Window;
      heading.Name="heading";heading.SetBounds(20,52,350,28);heading.Font=new Font(Font.FontFamily,12,FontStyle.Bold);
      percentage.Name="percentage";percentage.SetBounds(380,56,90,24);percentage.TextAlign=ContentAlignment.TopRight;
      meter.Name="progress";meter.SetBounds(20,94,450,12);meter.Maximum=1000;
      amount.Name="amount";amount.SetBounds(20,120,450,38);
      foreach(Control item in new Control[]{heading,percentage,meter,amount})item.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
      Controls.AddRange(new Control[]{heading,percentage,meter,amount});
      SetProgress(0,0,"正在准备更新","正在获取更新信息…");
    }
    internal void SetProgress(long completed,long total,string caption,string detail) {
      heading.Text=caption;meter.Style=total>0?ProgressBarStyle.Continuous:ProgressBarStyle.Marquee;
      if(total>0) {
        double fraction=Math.Max(0,Math.Min(1,(double)completed/total));meter.Value=(int)(fraction*1000);
        percentage.Text=Math.Floor(fraction*100).ToString("0")+"%";
        amount.Text=detail??string.Format("{0:0.0} MB / {1:0.0} MB",completed/1000000d,total/1000000d);
      }else {percentage.Text="";amount.Text=detail??"正在准备下载…";}
    }
  }
  internal sealed class ReadyUpdateView : Panel {
    readonly Label heading=new Label(),description=new Label();
    internal event EventHandler RestartRequested,DeferredRequested;
    internal ReadyUpdateView() {
      Size=new Size(490,220);Font=SystemFonts.MessageBoxFont;BackColor=SystemColors.Window;
      heading.Text="更新已准备好";heading.SetBounds(20,38,450,30);heading.Font=new Font(Font.FontFamily,12,FontStyle.Bold);
      description.SetBounds(20,80,450,48);
      var restart=new Button{Name="restart",Text="重启并更新"};restart.SetBounds(310,158,160,34);
      var later=new Button{Name="later",Text="稍后"};later.SetBounds(190,158,100,34);
      restart.Click+=(sender,e)=>{if(RestartRequested!=null)RestartRequested(this,EventArgs.Empty);};
      later.Click+=(sender,e)=>{if(DeferredRequested!=null)DeferredRequested(this,EventArgs.Empty);};
      Controls.AddRange(new Control[]{heading,description,later,restart});
    }
    internal void SetVersion(string version){description.Text="更新到 "+version+" 的文件已下载并通过校验。\n你可以继续工作，方便时再重启 Ecom。";}
  }
  internal sealed class InstallProgress {
    internal readonly string Stage,Caption,Detail;
    internal readonly long Completed,Total;
    internal InstallProgress(string stage,string caption,string detail,long completed=0,long total=0){Stage=stage;Caption=caption;Detail=detail;Completed=completed;Total=total;}
  }
  internal sealed class InstallProgressForm : Form {
    readonly DownloadProgressView view=new DownloadProgressView();
    readonly Label elapsed=new Label();
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer{Interval=1000};
    readonly Stopwatch clock=Stopwatch.StartNew();
    bool finished;
    internal InstallProgressForm() {
      Text="Ecom 安装更新";Font=SystemFonts.MessageBoxFont;BackColor=SystemColors.Window;
      ClientSize=new Size(490,220);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
      elapsed.Name="elapsed";elapsed.SetBounds(20,180,450,24);elapsed.Text="已用时间 00:00";view.Controls.Add(elapsed);Controls.Add(view);
      SetProgress(new InstallProgress("preparing","正在准备安装","完成后将自动打开 Ecom。安装期间请保持电脑开机。"));
      timer.Tick+=(sender,e)=>{elapsed.Text="已用时间 "+clock.Elapsed.ToString(@"mm\:ss");};timer.Start();
      FormClosing+=(sender,e)=>{if(!finished)e.Cancel=true;};FormClosed+=(sender,e)=>timer.Dispose();
    }
    internal void SetProgress(InstallProgress progress){view.SetProgress(progress.Completed,progress.Total,progress.Caption,progress.Detail);}
    internal void Finish(){finished=true;Close();}
  }
  static class Program {
    internal const string Package = "@petercjl/ecom-windows-x64";
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2000000 };
    internal static readonly string State = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ecom", "UpdateState");
    static readonly Dictionary<string,string> Args = new Dictionary<string,string>();
    static string AppDir, Profile, NativeDir, QuitEvent;
    static int BrowserPid;
    static Dictionary<string,object> Installed;
    // Apply runs on a worker thread; the observer marshals presentation to the
    // independent installer window. Tests can observe the same production steps.
    internal static Action<InstallProgress> InstallObserver;

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
        ReleaseInstallationDirectory();
        if(Args.ContainsKey("verify-payload")) {
          string work=Path.Combine(State,"verification",Guid.NewGuid().ToString("N"));PrivateDirectory(work);
          try {Require(!File.Exists(Get("report")),"Verification report already exists");VerifyIntegrity(Get("verify-payload"),Get("integrity"));Extract(Get("verify-payload"),work);FetchParts(work,Get("parts-dir"),null);var manifest=ValidatePayload(work,new Dictionary<string,object>{{"version",Get("version")}});AtomicJson(Get("report"),manifest);}
          finally {Directory.Delete(work,true);}return 0;
        }
        if(Args.ContainsKey("apply")) { Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);RunApplyWithProgress(Args["apply"]); return 0; }
        if(Args.ContainsKey("recover")) {
          string app=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application");
          if(Application.ExecutablePath.StartsWith(app+"\\",StringComparison.OrdinalIgnoreCase)) {
            string work=Path.Combine(State,"staging",Guid.NewGuid().ToString("N"));PrivateDirectory(work);string helper=Path.Combine(work,"EcomUpdateWorker.exe");File.Copy(Application.ExecutablePath,helper,false);Process.Start(UpdateProcess(helper,"--recover"));
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
        BrowserPid=int.Parse(Get("pid")); Require(BrowserPid>0,"Invalid browser process ID");QuitEvent=Get("quit-event");
        Require(Same(Process.GetProcessById(BrowserPid).MainModule.FileName,exe),"Browser process does not match the installation");
        Require(Regex.IsMatch(QuitEvent,@"^Local\\EcomUpdateQuit\.[a-f0-9-]{36}$"),"Invalid browser exit event");
        using(EventWaitHandle.OpenExisting(QuitEvent,EventWaitHandleRights.Synchronize)) {}
        string ticketPath=Path.Combine(State,"running-"+BrowserPid+".json");
        // Only the browser's native startup invokes this route. Replace our own
        // transient readiness receipt atomically; no profile files are modified.
        AtomicJson(ticketPath,new Dictionary<string,object>{{"pid",BrowserPid},{"version",S(Installed,"version")},{"sourceRevision",S(Installed,"sourceRevision")},{"quitEvent",QuitEvent},{"app",AppDir},{"profile",Profile}});
        bool created;
        using(var show=CreateShowSignal())using(var mutex=new Mutex(true,"Local\\EcomUpdater."+HashText(AppDir).Substring(0,24),out created)) {
          if(!created){if(!Args.ContainsKey("watch"))show.Set();return 0;}
          TryCleanup(S(Installed,"version"),false);
          Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
          var panel=new UpdateForm(Args.ContainsKey("watch"),show); Application.Run(panel);
        }
        return 0;
      } catch(Exception error) {
        try { PrivateDirectory(State); AtomicJson(Path.Combine(State,"last-error.json"),new Dictionary<string,object>{{"error",error.Message},{"type",error.GetType().FullName},{"details",error.ToString()},{"time",DateTime.UtcNow.ToString("o")}}); } catch {}
        if(!Args.ContainsKey("watch") && !Args.ContainsKey("self-test") && !Args.ContainsKey("verify-payload")) MessageBox.Show(error.Message,"Ecom 更新",MessageBoxButtons.OK,MessageBoxIcon.Error);
        return 1;
      }
    }

    internal static void Require(bool condition,string message) { if(!condition) throw new InvalidDataException(message); }
    static string Get(string key) { Require(Args.ContainsKey(key),"Missing argument: "+key); return Args[key]; }
    internal static string S(Dictionary<string,object> obj,string key) { object value; Require(obj.TryGetValue(key,out value) && value is string,"Missing string: "+key); return (string)value; }
    internal static long N(Dictionary<string,object> obj,string key) {object value;Require(obj.TryGetValue(key,out value)&&(value is int||value is long),"Missing integer: "+key);return Convert.ToInt64(value);}
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
    internal static void Extract(string tgz,string destination,bool part=false) {
      var expected=new HashSet<string>(part?new[]{"package/package.json","package/part.json","package/LICENSE","package/EcomSetup.part"}:new[]{"package/package.json","package/artifact.json","package/LICENSE"});
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
          Require(size>=0 && expanded<=390000000 && (name.EndsWith(".part") ? size<=50000000 : size<=1000000),"Invalid archive entry size");
          string target=Path.Combine(destination,Path.GetFileName(name));
          using(var output=new FileStream(target,FileMode.CreateNew)) {
            byte[] buf=new byte[65536];long left=size;while(left>0){int count=(int)Math.Min(buf.Length,left);ReadExactly(tar,buf,count);output.Write(buf,0,count);left-=count;}
          }
          long pad=(512-size%512)%512;if(pad>0){var bytes=new byte[(int)pad];ReadExactly(tar,bytes,bytes.Length);Require(bytes.All(b=>b==0),"Invalid tar padding");}
        }
      }
      Require(expected.Count==0,"Incomplete npm payload");
    }
    static void FetchParts(string work,string localDirectory,Action<long> progress) {
      var manifest=ReadObject(Path.Combine(work,"artifact.json"));ValidateIdentity(manifest);
      Require(S(manifest,"payloadFormat")=="npm-parts-v1","Unsupported Windows payload layout");
      var parts=((System.Collections.IEnumerable)manifest["parts"]).Cast<Dictionary<string,object>>().ToArray();
      Require(parts.Length>0&&parts.Length<=8,"Invalid payload part count");
      long total=0,transferred=0;int index=0;
      using(var installer=new FileStream(Path.Combine(work,"EcomSetup.exe"),FileMode.CreateNew))foreach(var part in parts) {
        string version=S(manifest,"version")+"-payload."+index;
        long bytes=N(part,"bytes");
        Require(N(part,"index")==index&&S(part,"version")==version&&bytes>0&&bytes<=50000000&&Regex.IsMatch(S(part,"sha256"),"^[a-f0-9]{64}$"),"Invalid immutable payload part");
        string directory=Path.Combine(work,"part-"+index);Directory.CreateDirectory(directory);string tgz=Path.Combine(directory,"payload.tgz");
        if(localDirectory!=null)File.Copy(Path.Combine(localDirectory,"petercjl-ecom-windows-x64-"+version+".tgz"),tgz,false);
        else {
          Dictionary<string,object> metadata;
          using(var response=Open(new Uri("https://registry.npmjs.org/@petercjl%2fecom-windows-x64/"+version)))using(var input=response.GetResponseStream())using(var output=new MemoryStream()) {CopyBounded(input,output,1500000,null);metadata=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(output.ToArray()));}
          Require(S(metadata,"name")==Package&&S(metadata,"version")==version,"Unexpected payload part registry identity");
          var dist=(Dictionary<string,object>)metadata["dist"];Require(S(dist,"integrity")==S(part,"integrity"),"Payload part registry integrity differs from manifest");
          using(var response=Open(new Uri(S(dist,"tarball"))))using(var input=response.GetResponseStream())using(var output=new FileStream(tgz,FileMode.CreateNew))CopyBounded(input,output,70000000,n=>{if(progress!=null)progress(transferred+n);});
        }
        Require(new FileInfo(tgz).Length==N(part,"tarballBytes")&&Hash(tgz)==S(part,"tarballSha256"),"Payload part package differs from manifest");
        VerifyIntegrity(tgz,S(part,"integrity"));Extract(tgz,directory,true);
        var pkg=ReadObject(Path.Combine(directory,"package.json"));var info=ReadObject(Path.Combine(directory,"part.json"));
        Require(S(pkg,"name")==Package&&S(pkg,"version")==version&&!pkg.ContainsKey("scripts")&&!pkg.ContainsKey("dependencies"),"Unexpected payload part package");
        string binary=Path.Combine(directory,"EcomSetup.part");
        Require(N(info,"schemaVersion")==1&&S(info,"version")==S(manifest,"version")&&N(info,"index")==index&&N(info,"bytes")==bytes&&S(info,"sha256")==S(part,"sha256")&&new FileInfo(binary).Length==bytes&&Hash(binary)==S(part,"sha256"),"Payload part content mismatch");
        using(var input=File.OpenRead(binary))CopyBounded(input,installer,50000000,null);
        total+=bytes;transferred+=new FileInfo(tgz).Length;Require(total<=390000000,"Installer exceeds size limit");index++;
      }
      Require(total==N(manifest,"archiveBytes")&&Hash(Path.Combine(work,"EcomSetup.exe"))==S(manifest,"archiveSha256"),"Reassembled installer integrity mismatch");
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

    static EventWaitHandle CreateShowSignal() {
      var security=new EventWaitHandleSecurity();security.SetAccessRuleProtection(true,false);
      foreach(var sid in new[]{WindowsIdentity.GetCurrent().User,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})security.AddAccessRule(new EventWaitHandleAccessRule(sid,EventWaitHandleRights.FullControl,AccessControlType.Allow));
      bool created;return new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\EcomUpdater.Show."+HashText(AppDir).Substring(0,24),out created,security);
    }
    static void RefreshBrowserContext() {
      foreach(string file in Directory.GetFiles(State,"running-*.json").OrderByDescending(File.GetLastWriteTimeUtc))try {
        var row=ReadObject(file);if(!row.ContainsKey("app")||!row.ContainsKey("profile")||!Same(S(row,"app"),AppDir)||!Same(S(row,"profile"),Profile))continue;
        int pid=checked((int)N(row,"pid"));Require(pid>0,"Invalid browser process ID");
        using(var process=Process.GetProcessById(pid))if(!Same(process.MainModule.FileName,Path.Combine(AppDir,"Ecom.exe")))continue;
        string quit=S(row,"quitEvent");Require(Regex.IsMatch(quit,@"^Local\\EcomUpdateQuit\.[a-f0-9-]{36}$"),"Invalid browser exit event");
        using(EventWaitHandle.OpenExisting(quit,EventWaitHandleRights.Synchronize)){}
        BrowserPid=pid;QuitEvent=quit;return;
      }catch(ArgumentException){}catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}catch(IOException){}
    }
    internal static Dictionary<string,object> CreateBoundJob(string app,string profile,int pid,string quit,Dictionary<string,object> job,bool rollback) {
      Require(pid>0,"Invalid browser process ID");Require(!string.IsNullOrEmpty(app)&&!string.IsNullOrEmpty(profile)&&!string.IsNullOrEmpty(quit),"Incomplete browser context");
      job["app"]=app;job["profile"]=profile;job["pid"]=pid;job["quitEvent"]=quit;job["rollback"]=rollback;return job;
    }
    static Dictionary<string,object> BindBrowserJob(Dictionary<string,object> job,bool rollback){RefreshBrowserContext();return CreateBoundJob(AppDir,Profile,BrowserPid,QuitEvent,job,rollback);}
    static Dictionary<string,object> ValidateStagedPayload(string work,Dictionary<string,object> metadata,string integrity) {
      work=Path.GetFullPath(work);Require(work.StartsWith(Path.Combine(State,"staging")+"\\",StringComparison.OrdinalIgnoreCase),"Invalid staging directory");
      string tgz=Path.Combine(work,"payload.tgz");VerifyIntegrity(tgz,integrity);
      string verification=Path.Combine(State,"verification",Guid.NewGuid().ToString("N"));PrivateDirectory(verification);
      try {
        Extract(tgz,verification);
        foreach(string name in new[]{"artifact.json","package.json"})Require(Hash(Path.Combine(work,name))==Hash(Path.Combine(verification,name)),"Prepared package metadata changed");
        return ValidatePayload(work,metadata);
      }finally{Directory.Delete(verification,true);}
    }
    static Dictionary<string,object> PreparedRecord(string app,string profile,string work,Dictionary<string,object> metadata,string integrity) {
      return new Dictionary<string,object>{{"schemaVersion",1},{"app",app},{"profile",profile},{"work",work},{"metadata",metadata},{"integrity",integrity},{"preparedAt",DateTime.UtcNow.ToString("o")}};
    }
    static void SavePreparedRecord(Dictionary<string,object> row,string app,string profile,string installedVersion) {
      Require(N(row,"schemaVersion")==1&&Same(S(row,"app"),app)&&Same(S(row,"profile"),profile),"Prepared update context differs");
      var metadata=(Dictionary<string,object>)row["metadata"];Require(ParseVersion(S(metadata,"version"))>ParseVersion(installedVersion),"Prepared version is not newer");
      ValidateStagedPayload(S(row,"work"),metadata,S(row,"integrity"));AtomicJson(Path.Combine(State,"ready.json"),row);
    }
    static Dictionary<string,object> ReadPreparedRecord(string app,string profile,string installedVersion) {
      string file=Path.Combine(State,"ready.json");if(!File.Exists(file))return null;
      var row=ReadObject(file);Require(N(row,"schemaVersion")==1&&Same(S(row,"app"),app)&&Same(S(row,"profile"),profile),"Prepared update context differs");
      var metadata=(Dictionary<string,object>)row["metadata"];if(ParseVersion(S(metadata,"version"))<=ParseVersion(installedVersion))return null;
      ValidateStagedPayload(S(row,"work"),metadata,S(row,"integrity"));return row;
    }
    sealed class UpdateForm : Form {
      readonly Label status=new Label();readonly ComboBox channel=new ComboBox();readonly Button check=new Button(),download=new Button(),rollback=new Button();
      readonly Panel options=new Panel{Dock=DockStyle.Fill};
      readonly DownloadProgressView transfer=new DownloadProgressView{Dock=DockStyle.Fill,Visible=false};
      readonly ReadyUpdateView readyView=new ReadyUpdateView{Dock=DockStyle.Fill,Visible=false};
      readonly NotifyIcon tray=new NotifyIcon();readonly System.Windows.Forms.Timer showTimer=new System.Windows.Forms.Timer{Interval=500};
      readonly EventWaitHandle showSignal;readonly bool automatic;
      Dictionary<string,object> candidate,prepared;bool downloading,allowClose;
      sealed class DownloadState {
        internal readonly long Bytes,Total;internal readonly string Caption,Detail;
        internal DownloadState(long bytes,long total,string caption,string detail=null){Bytes=bytes;Total=total;Caption=caption;Detail=detail;}
      }
      public UpdateForm(bool automatic,EventWaitHandle showSignal) {
        this.automatic=automatic;this.showSignal=showSignal;Font=SystemFonts.MessageBoxFont;BackColor=SystemColors.Window;Text="Ecom 更新";ClientSize=new Size(490,220);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        var label=new Label{Text="当前版本："+S(Installed,"version")+"   Windows x64",AutoSize=true,Location=new Point(20,20)};
        var cl=new Label{Text="更新渠道",AutoSize=true,Location=new Point(20,55)};
        channel.DropDownStyle=ComboBoxStyle.DropDownList;channel.Items.AddRange(new object[]{"latest","next"});channel.SelectedItem=Channel();channel.Location=new Point(100,50);
        check.Text="检查更新";check.Location=new Point(310,49);check.Size=new Size(150,30);
        status.SetBounds(20,98,450,50);status.Text="准备检查更新。";
        download.Text="下载更新";download.SetBounds(310,162,150,32);download.Enabled=false;
        rollback.Text="恢复上一版本";rollback.SetBounds(20,162,150,32);rollback.Enabled=File.Exists(Path.Combine(State,"rollback.json"));
        options.Controls.AddRange(new Control[]{label,cl,channel,check,status,download,rollback});Controls.AddRange(new Control[]{options,transfer,readyView});
        tray.Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath)??(Icon)SystemIcons.Application.Clone();tray.Text="Ecom 更新";
        var menu=new ContextMenuStrip();menu.Items.Add("打开更新窗口",null,(sender,e)=>ShowCurrent());menu.Items.Add("退出更新程序",null,(sender,e)=>CloseUpdater());tray.ContextMenuStrip=menu;
        tray.DoubleClick+=(sender,e)=>ShowCurrent();tray.BalloonTipClicked+=(sender,e)=>ShowCurrent();
        showTimer.Tick+=(sender,e)=>{if(showSignal.WaitOne(0)){RefreshBrowserContext();ShowCurrent();}};showTimer.Start();
        FormClosing+=(sender,e)=>{if(!allowClose&&(downloading||prepared!=null)){e.Cancel=true;Hide();tray.Visible=true;}};
        FormClosed+=(sender,e)=>{showTimer.Stop();showTimer.Dispose();tray.Visible=false;var icon=tray.Icon;tray.Dispose();menu.Dispose();if(icon!=null)icon.Dispose();};
        Resize+=(sender,e)=>{if(WindowState==FormWindowState.Minimized&&(downloading||prepared!=null)){Hide();tray.Visible=true;}};
        channel.SelectedIndexChanged+=(sender,e)=>{candidate=null;download.Enabled=false;AtomicJson(Path.Combine(State,"channel.json"),new Dictionary<string,object>{{"channel",channel.SelectedItem.ToString()}});status.Text="已选择 "+channel.SelectedItem+"，请检查更新。";};
        check.Click+=async(sender,e)=>await Check();download.Click+=async(sender,e)=>await Download();
        rollback.Click+=(sender,e)=>{if(MessageBox.Show(this,"恢复上一版本会退出并重新启动 Ecom。账号及用户数据会保留。是否继续？","Ecom 更新",MessageBoxButtons.YesNo,MessageBoxIcon.Question)==DialogResult.Yes)try{StartWorker(null,true);}catch(Exception error){status.Text="恢复未开始："+error.Message;}};
        readyView.DeferredRequested+=(sender,e)=>CloseUpdater();
        readyView.RestartRequested+=(sender,e)=>{try{var job=new Dictionary<string,object>{{"work",S(prepared,"work")},{"metadata",prepared["metadata"]},{"integrity",S(prepared,"integrity")}};StartWorker(job,false);}catch(Exception error){MessageBox.Show(this,error.Message,"Ecom 更新",MessageBoxButtons.OK,MessageBoxIcon.Error);}};
        Shown+=async(sender,e)=>await Initialize();
      }
      void CloseUpdater(){allowClose=true;Close();}
      void Notify(string text){tray.Visible=true;tray.ShowBalloonTip(5000,"Ecom 更新",text,ToolTipIcon.Info);}
      void SetView(Control view){foreach(Control item in new Control[]{options,transfer,readyView})item.Visible=item==view;view.BringToFront();}
      void ShowCurrent(){if(prepared!=null&&!downloading){readyView.SetVersion(S((Dictionary<string,object>)prepared["metadata"],"version"));SetView(readyView);}else SetView(downloading?(Control)transfer:options);Show();WindowState=FormWindowState.Normal;Activate();}
      void MarkReady(Dictionary<string,object> row){prepared=row;downloading=false;readyView.SetVersion(S((Dictionary<string,object>)row["metadata"],"version"));SetView(readyView);Notify("更新已下载并通过校验。你可以继续工作，方便时再重启更新。");}
      async Task Initialize() {
        if(automatic)Hide();
        try{var row=await Task.Run(()=>ReadPreparedRecord(AppDir,Profile,S(Installed,"version")));if(row!=null){MarkReady(row);if(!automatic)ShowCurrent();return;}}catch(Exception error){status.Text="已保存的更新包需要重新下载："+error.Message;}
        await Check();
        if(automatic){if(candidate==null)CloseUpdater();else {Hide();Notify("发现可用更新。点击此通知选择下载，下载期间可继续使用 Ecom。");}}
      }
      async Task Check() {
        check.Enabled=false;channel.Enabled=false;download.Enabled=false;candidate=null;status.Text="正在检查 "+channel.SelectedItem+"…";
        try {string selected=channel.SelectedItem.ToString();var metadata=await Task.Run(()=>Metadata(selected));Require(S(metadata,"name")==Package,"Unexpected package name");if(ParseVersion(S(metadata,"version"))>ParseVersion(S(Installed,"version"))){candidate=metadata;download.Enabled=true;status.Text="可更新到 "+S(metadata,"version")+"（"+selected+"）。下载将在后台进行。";}else status.Text="当前渠道没有更新。当前版本："+S(Installed,"version");}
        catch(Exception error){status.Text="检查失败："+error.Message;}finally{check.Enabled=true;channel.Enabled=true;}
      }
      async Task Download() {
        downloading=true;download.Enabled=false;check.Enabled=false;channel.Enabled=false;rollback.Enabled=false;
        SetView(transfer);transfer.SetProgress(0,0,"正在准备更新","正在获取更新信息…");Show();WindowState=FormWindowState.Normal;
        Notify("正在下载更新。最小化或关闭进度窗口后仍会继续下载，下载完成后会通知。");
        string work=Path.Combine(State,"staging",Guid.NewGuid().ToString("N"));
        try {
          PrivateDirectory(work);var metadata=candidate;var dist=(Dictionary<string,object>)metadata["dist"];string tgz=Path.Combine(work,"payload.tgz"),integrity=S(dist,"integrity");var url=new Uri(S(dist,"tarball"));
          IProgress<DownloadState> progress=new Progress<DownloadState>(p=>transfer.SetProgress(p.Bytes,p.Total,p.Caption,p.Detail));
          var row=await Task.Run(()=>{
            using(var response=Open(url))using(var input=response.GetResponseStream())using(var output=new FileStream(tgz,FileMode.CreateNew)){Require(response.ContentLength<=70000000,"Package too large");CopyBounded(input,output,70000000,null);}
            VerifyIntegrity(tgz,integrity);Extract(tgz,work);var parts=((System.Collections.IEnumerable)ReadObject(Path.Combine(work,"artifact.json"))["parts"]).Cast<Dictionary<string,object>>().ToArray();Require(parts.Length>0&&parts.Length<=8,"Invalid payload part count");
            long primary=new FileInfo(tgz).Length,total=primary+parts.Sum(p=>N(p,"tarballBytes"));progress.Report(new DownloadState(primary,total,"正在下载更新"));
            FetchParts(work,null,n=>progress.Report(new DownloadState(primary+n,total,"正在下载更新")));progress.Report(new DownloadState(total,total,"正在校验更新包","下载完成，正在验证完整性…"));
            var saved=PreparedRecord(AppDir,Profile,work,metadata,integrity);SavePreparedRecord(saved,AppDir,Profile,S(Installed,"version"));return saved;
          });
          MarkReady(row);
        }catch(Exception error){downloading=false;SetView(options);status.Text="更新未应用："+error.Message;Notify("更新下载未完成。点击此通知查看原因并重试。");}
        finally{if(!IsDisposed&&!Disposing){check.Enabled=true;channel.Enabled=true;download.Enabled=candidate!=null;rollback.Enabled=File.Exists(Path.Combine(State,"rollback.json"));}}
      }
      void StartWorker(Dictionary<string,object> job,bool restore) {
        if(job==null)job=new Dictionary<string,object>();BindBrowserJob(job,restore);
        string workerDirectory=Path.Combine(State,"workers",Guid.NewGuid().ToString("N"));PrivateDirectory(workerDirectory);
        string worker=Path.Combine(workerDirectory,"EcomUpdateWorker.exe");File.Copy(Application.ExecutablePath,worker,false);
        string file=Path.Combine(workerDirectory,"job.json");AtomicJson(file,job);
        SetView(transfer);transfer.SetProgress(0,0,"正在启动安装程序","安装进度将在独立窗口中显示，完成后自动打开 Ecom。");
        Process.Start(UpdateProcess(worker,"--apply "+Quote(file)));CloseUpdater();
      }
    }
    static void RunApplyWithProgress(string jobFile) {
      Exception failure=null;
      using(var window=new InstallProgressForm()) {
        window.Shown+=async(sender,e)=>{
          IProgress<InstallProgress> progress=new Progress<InstallProgress>(p=>window.SetProgress(p));
          InstallObserver=p=>progress.Report(p);
          var clock=Stopwatch.StartNew();var steps=new List<Dictionary<string,object>>();
          Action<InstallProgress> display=InstallObserver;string previousStage=null;
          InstallObserver=p=>{
            if(p.Stage!=previousStage){previousStage=p.Stage;steps.Add(new Dictionary<string,object>{{"stage",p.Stage},{"elapsedMs",clock.ElapsedMilliseconds},{"utc",DateTime.UtcNow.ToString("o")},{"completed",p.Completed},{"total",p.Total}});}
            display(p);
          };
          try{await Task.Run(()=>Apply(ReadObject(jobFile)));}
          catch(Exception error){failure=error;}
          finally {
            InstallObserver=null;
            try{AtomicJson(Path.Combine(Path.GetDirectoryName(jobFile),"timing.json"),new Dictionary<string,object>{{"ok",failure==null},{"elapsedMs",clock.ElapsedMilliseconds},{"steps",steps}});}catch{}
            window.Finish();
          }
        };
        Application.Run(window);
      }
      if(failure!=null)throw failure;
    }
    static void InstallationStep(string stage,string caption,string detail,long completed=0,long total=0) {
      var observer=InstallObserver;if(observer!=null)observer(new InstallProgress(stage,caption,detail,completed,total));
    }
    static string Quote(string value) { Require(value.IndexOf('"')<0 && !value.EndsWith("\\"),"Invalid path argument");return "\""+value+"\""; }
    static string RelaunchArguments(string profile) { return "--user-data-dir="+Quote(profile)+" --restore-last-session"; }
    // Windows keeps a handle to the current directory. A helper inherited from
    // Ecom must release that handle before replacing or renaming Application.
    static void ReleaseInstallationDirectory() { PrivateDirectory(State);Directory.SetCurrentDirectory(State); }
    static ProcessStartInfo UpdateProcess(string executable,string arguments) {
      return new ProcessStartInfo(executable,arguments){UseShellExecute=false,WorkingDirectory=State};
    }
    static void DeleteOwnedTree(string directory) {
      Require((File.GetAttributes(directory)&FileAttributes.ReparsePoint)==0,"Cleanup reparse directory rejected");
      foreach(string entry in Directory.GetFileSystemEntries(directory)) {
        var attributes=File.GetAttributes(entry);Require((attributes&FileAttributes.ReparsePoint)==0,"Cleanup reparse entry rejected");
        if((attributes&FileAttributes.Directory)!=0)DeleteOwnedTree(entry);else File.Delete(entry);
      }
      Directory.Delete(directory);
    }
    internal static void CleanupState(string root,string installedVersion,string executingFile) {
      var keep=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      string pendingFile=Path.Combine(root,"pending.json");
      if(File.Exists(pendingFile)) {
        var pending=ReadObject(pendingFile);if(S(pending,"status")=="installing")return;
      }
      string rollbackFile=Path.Combine(root,"rollback.json");
      if(File.Exists(rollbackFile))keep.Add(Path.GetFullPath(S(ReadObject(rollbackFile),"backup")));
      string readyFile=Path.Combine(root,"ready.json");
      if(File.Exists(readyFile)) {
        var ready=ReadObject(readyFile);
        if(ParseVersion(S((Dictionary<string,object>)ready["metadata"],"version"))>ParseVersion(installedVersion))keep.Add(Path.GetFullPath(S(ready,"work")));
        else {File.Delete(readyFile);if(File.Exists(readyFile+".previous"))File.Delete(readyFile+".previous");}
      }
      keep.Add(Path.GetDirectoryName(Path.GetFullPath(executingFile)));
      // Only updater-owned GUID directories in these dedicated areas qualify.
      // Profile data, installations and incident evidence are outside this set.
      foreach(string area in new[]{"staging","workers","backups","verification","replaced"}) {
        string parent=Path.Combine(root,area);if(!Directory.Exists(parent))continue;
        Require((File.GetAttributes(parent)&FileAttributes.ReparsePoint)==0,"Cleanup area reparse point rejected");
        foreach(string directory in Directory.GetDirectories(parent))if(Regex.IsMatch(Path.GetFileName(directory),"^[a-f0-9]{32}$")&&!keep.Contains(Path.GetFullPath(directory)))DeleteOwnedTree(directory);
      }
    }
    static void TryCleanup(string installedVersion,bool ownsApplyLock) {
      try {
        if(ownsApplyLock)CleanupState(State,installedVersion,Application.ExecutablePath);
        else using(var guard=new FileStream(Path.Combine(State,"apply.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None))CleanupState(State,installedVersion,Application.ExecutablePath);
      }catch(Exception error) {
        // Cleanup must never turn a verified installation into a rollback.
        try{AtomicJson(Path.Combine(State,"cleanup-error.json"),new Dictionary<string,object>{{"error",error.Message},{"time",DateTime.UtcNow.ToString("o")}});}catch{}
      }
    }
    static void CloseBrowser(int pid,string app,string quitEvent) {
      Require(pid>0,"Invalid browser process ID");
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
    static void EnsureNoInstaller() {
      Require(!new[]{"EcomSetup","mini_installer","setup"}.Any(name=>Process.GetProcessesByName(name).Any()),"Installer is still running; recovery is deferred until it exits");
    }
    static void CopyTree(string source,string destination) {
      Require(!Directory.Exists(destination),"Backup target exists");Directory.CreateDirectory(destination);
      foreach(string entry in Directory.GetFileSystemEntries(source)) {
        var attr=File.GetAttributes(entry);Require((attr&FileAttributes.ReparsePoint)==0,"Application reparse point rejected");
        string target=Path.Combine(destination,Path.GetFileName(entry));
        if((attr&FileAttributes.Directory)!=0)CopyTree(entry,target);else {File.Copy(entry,target,false);Require(Hash(entry)==Hash(target),"Backup verification failed");}
      }
    }
    static void BackupApplication(string app,string destination) {
      // Full npm installers carry all program files. The archive retained by
      // Brave's legacy differential updater is not used for launch, uninstall
      // or our verified file-copy rollback. Keep setup.exe and every other file.
      string cache=Path.Combine(VersionDirectory(app),"Installer","chrome.7z");
      Require(!Directory.Exists(destination),"Backup target exists");
      var files=new List<string>();var directories=new List<string>();
      Action<string> scan=null;
      scan=directory=>{
        directories.Add(directory);
        foreach(string entry in Directory.GetFileSystemEntries(directory)) {
          var attributes=File.GetAttributes(entry);Require((attributes&FileAttributes.ReparsePoint)==0,"Application reparse point rejected");
          if((attributes&FileAttributes.Directory)!=0)scan(entry);
          else if(!Same(entry,cache))files.Add(entry);
        }
      };
      scan(app);long total=files.Sum(file=>new FileInfo(file).Length),done=0;
      foreach(string directory in directories)Directory.CreateDirectory(destination+directory.Substring(app.Length));
      InstallationStep("backup","正在备份当前版本","正在复制并校验回滚所需的程序文件…",0,total);
      foreach(string file in files) {
        string target=destination+file.Substring(app.Length);File.Copy(file,target,false);
        Require(Hash(file)==Hash(target),"Backup verification failed");done+=new FileInfo(file).Length;
        InstallationStep("backup","正在备份当前版本",string.Format("已校验 {0:0.0} MB / {1:0.0} MB",done/1000000d,total/1000000d),done,total);
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
      InstallationStep("starting","正在启动 Ecom","正在恢复原有窗口和店铺容器…");
      DateTime startedAt=DateTime.UtcNow;
      var process=Process.Start(UpdateProcess(Path.Combine(app,"Ecom.exe"),RelaunchArguments(profile)));
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
        if(healthy){if(stableSince<0){stableSince=timer.Elapsed.TotalSeconds;InstallationStep("confirming","Ecom 已启动","正在确认启动稳定，完成后会自动关闭此窗口。");}if(timer.Elapsed.TotalSeconds-stableSince>=10)return process;}
        else stableSince=-1;
        Thread.Sleep(250);
      }
      throw new IOException("Updated Ecom did not report startup readiness; recovery is retained");
    }
    static void Restore(Dictionary<string,object> recovery) {
      InstallationStep("restoring","正在恢复上一版本","正在校验并恢复回滚副本，完成后自动打开 Ecom。");
      ReleaseInstallationDirectory();
      EnsureNoInstaller();
      string app=S(recovery,"app"),backup=S(recovery,"backup");
      Require(Same(app,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application")) && backup.StartsWith(State+"\\",StringComparison.OrdinalIgnoreCase),"Invalid recovery target");
      EnsureNoBrowser(app);
      Require(Directory.Exists(backup) && File.Exists(Path.Combine(backup,"Ecom.exe")),"Recovery copy unavailable");
      Require(Hash(Path.Combine(backup,"Ecom.exe"))==S(recovery,"exeSha256") && Hash(Path.Combine(VersionDirectory(backup),"chrome.dll"))==S(recovery,"frameworkSha256"),"Recovery program integrity mismatch");
      Require(Hash(Path.Combine(VersionDirectory(backup),"ecom-update.json"))==S(recovery,"metadataSha256") && Hash(Path.Combine(VersionDirectory(backup),"EcomUpdater.exe"))==S(recovery,"updaterSha256"),"Recovery metadata or helper integrity mismatch");
      if(Directory.Exists(app)){string replaced=Path.Combine(State,"replaced");PrivateDirectory(replaced);Directory.Move(app,Path.Combine(replaced,Guid.NewGuid().ToString("N")));}
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
      pending["status"]="recovered";AtomicJson(Path.Combine(State,"pending.json"),pending);TryCleanup(S(pending,"version"),false);
    }
    static void Apply(Dictionary<string,object> job) {
      ReleaseInstallationDirectory();
      string app=Path.GetFullPath(S(job,"app")),profile=Path.GetFullPath(S(job,"profile"));
      Require(N(job,"pid")>0&&N(job,"pid")<=int.MaxValue,"Invalid browser process ID");
      Require(Same(app,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom","Application")),"Unsupported installation target");
      using(var guard=new FileStream(Path.Combine(State,"apply.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
        bool rollback=Convert.ToBoolean(job["rollback"]);Dictionary<string,object> artifact=null;
        InstallationStep("verifying","正在校验更新文件","正在确认更新完整性和目标版本…");
        if(!rollback) {string work=S(job,"work");Require(work.StartsWith(Path.Combine(State,"staging")+"\\",StringComparison.OrdinalIgnoreCase),"Invalid staging directory");artifact=ValidateStagedPayload(work,(Dictionary<string,object>)job["metadata"],S(job,"integrity"));Require(ParseVersion(S(artifact,"version"))>ParseVersion(S(ReadObject(Path.Combine(VersionDirectory(app),"ecom-update.json")),"version")),"Update is no longer newer");}
        EnsureNoInstaller();
        InstallationStep("closing","正在退出 Ecom","正在保存会话并正常退出，请完成浏览器中的待处理对话框。");
        CloseBrowser((int)N(job,"pid"),app,S(job,"quitEvent"));
        if(rollback) {var recovery=ReadObject(Path.Combine(State,"rollback.json"));Restore(recovery);Restart(app,profile,S(recovery,"version"));recovery["status"]="recovered";AtomicJson(Path.Combine(State,"pending.json"),recovery);TryCleanup(S(recovery,"version"),true);return;}
        string backup=Path.Combine(State,"backups",Guid.NewGuid().ToString("N"));PrivateDirectory(Path.GetDirectoryName(backup));BackupApplication(app,backup);
        var previous=ReadObject(Path.Combine(VersionDirectory(app),"ecom-update.json"));
        var record=new Dictionary<string,object>{{"app",app},{"backup",backup},{"version",S(previous,"version")},{"profile",profile},{"exeSha256",Hash(Path.Combine(app,"Ecom.exe"))},{"frameworkSha256",Hash(Path.Combine(VersionDirectory(app),"chrome.dll"))},{"metadataSha256",Hash(Path.Combine(VersionDirectory(app),"ecom-update.json"))},{"updaterSha256",Hash(Path.Combine(VersionDirectory(app),"EcomUpdater.exe"))},{"status","installing"}};
        record["registration"]=CaptureRegistration();
        AtomicJson(Path.Combine(State,"pending.json"),record);
        Process launched=null;
        try {
          InstallationStep("installing","正在安装 Ecom","正在解压并替换程序文件。此步骤可能需要约一分钟，请稍候…");
          using(var installer=Process.Start(UpdateProcess(Path.Combine(S(job,"work"),"EcomSetup.exe"),"--do-not-launch-chrome"))) {
            Require(installer.WaitForExit(600000),"Installer still running; recovery deferred until it exits");Require(installer.ExitCode==0,"Installer failed: "+installer.ExitCode);
          }
          InstallationStep("validating","正在校验安装结果","正在核对程序完整性，随后自动启动 Ecom。");
          ValidateInstalled(app,artifact);EnsureNoBrowser(app);Restart(app,profile,S(artifact,"version"),p=>launched=p);
          AtomicJson(Path.Combine(State,"rollback.json"),record);record["status"]="complete";AtomicJson(Path.Combine(State,"pending.json"),record);
          AtomicJson(Path.Combine(State,"last-result.json"),new Dictionary<string,object>{{"status","updated"},{"version",S(artifact,"version")},{"sourceRevision",S(artifact,"sourceRevision")},{"pid",launched.Id},{"backup",backup}});
          InstallationStep("cleanup","正在清理更新文件","更新已成功，正在自动清理下载和安装临时文件。");
          TryCleanup(S(artifact,"version"),true);
          InstallationStep("complete","更新已完成","Ecom 已打开，窗口和店铺容器正在恢复。",1,1);
        } catch(Exception updateError) {
          AtomicJson(Path.Combine(State,"last-apply-error.json"),new Dictionary<string,object>{{"error",updateError.Message},{"details",updateError.ToString()},{"time",DateTime.UtcNow.ToString("o")}});
          try {
          if(launched!=null && !launched.HasExited) {string ready=Path.Combine(State,"running-"+launched.Id+".json");Require(File.Exists(ready),"Startup outcome unknown; quit Ecom and run recovery");CloseBrowser(launched.Id,app,S(ReadObject(ready),"quitEvent"));}
          EnsureNoInstaller();
          Restore(record);Restart(app,profile,S(previous,"version"));
          record["status"]="recovered";AtomicJson(Path.Combine(State,"pending.json"),record);
          } catch(Exception recoveryError) {throw new AggregateException("更新未完成，恢复也未完成；已保留恢复副本。",updateError,recoveryError);}
          throw;
        }
      }
    }

    static void SelfTest() {
      var bound=CreateBoundJob(@"C:\Ecom\Application",@"C:\Ecom\User Data",12345,"Local\\EcomUpdateQuit.00000000-0000-0000-0000-000000000001",new Dictionary<string,object>{{"pid",null}},false);
      Require(N(Json.Deserialize<Dictionary<string,object>>(Json.Serialize(bound)),"pid")==12345,"GUI worker browser PID must survive serialization");
      bool missingPidRejected=false;try{N(new Dictionary<string,object>{{"pid",null}},"pid");}catch{missingPidRejected=true;}Require(missingPidRejected,"Null browser PID accepted");
      foreach(int invalidPid in new[]{0,-1}){bool rejected=false;try{CreateBoundJob("app","profile",invalidPid,"event",new Dictionary<string,object>(),false);}catch{rejected=true;}Require(rejected,"Invalid browser PID accepted");}
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
        File.WriteAllText(Path.Combine(work,"self-test.json"),"{\"ok\":true,\"checks\":[\"semver\",\"registry-origin\",\"sha512-corruption\",\"tar-traversal\",\"tar-symlinks\",\"tar-hardlinks\",\"gui-worker-pid\"]}");
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
