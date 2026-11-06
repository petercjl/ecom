// Exercise the production apply/restore implementation on the explicitly
// selected test baseline. Run in its interactive Windows session.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
namespace EcomUpdate {
  static class LocalRoundtripMain {
    static object Call(string name,params object[] args) {
      try{return typeof(Program).GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,args);}
      catch(TargetInvocationException e){throw e.InnerException;}
    }
    static Dictionary<string,object> Live(string app,string version) {
      foreach(string file in Directory.GetFiles(Program.State,"running-*.json").OrderByDescending(File.GetLastWriteTimeUtc))try {
        var row=Program.ReadObject(file);int pid=Convert.ToInt32(row["pid"]);var p=Process.GetProcessById(pid);
        if(Program.S(row,"version")==version&&string.Equals(p.MainModule.FileName,Path.Combine(app,"Ecom.exe"),StringComparison.OrdinalIgnoreCase))return row;
      }catch(ArgumentException){}catch(InvalidOperationException){}
      throw new InvalidOperationException("No matching live baseline process");
    }
    static Dictionary<string,object> Snapshot(string data) {
      var result=new Dictionary<string,object>();
      var state=Program.ReadObject(Path.Combine(data,"Local State"));
      var profiles=(Dictionary<string,object>)((Dictionary<string,object>)state["profile"])["info_cache"];
      foreach(string profile in profiles.Keys) {
        string file=Path.Combine(data,profile,"Preferences");if(!File.Exists(file))continue;
        var prefs=Program.ReadObject(file);var brave=(Dictionary<string,object>)prefs["brave"];var containers=(Dictionary<string,object>)brave["containers"];
        // Default container definitions need not be materialized in Preferences.
        // Include locally used and shop-bound IDs as well as explicit definitions.
        var ids=new List<string>();object value;
        if(containers.TryGetValue("list",out value))ids.AddRange(((System.Collections.IEnumerable)value).Cast<Dictionary<string,object>>().Select(v=>"defined:"+Program.S(v,"id")));
        if(containers.TryGetValue("used",out value))ids.AddRange(((Dictionary<string,object>)value).Keys.Select(id=>"used:"+id));
        if(prefs.TryGetValue("ecom",out value)) {object shops;if(((Dictionary<string,object>)value).TryGetValue("shop_containers",out shops))ids.AddRange(((Dictionary<string,object>)shops).Keys.Select(id=>"shop:"+id));}
        Program.Require(ids.Count>0,"No persisted container identity evidence");
        result[profile]=Call("HashText",string.Join("\n",ids.OrderBy(v=>v)));
      }
      return result;
    }
    // Explicit test-baseline migration: unlike a product update, both versions
    // are 0.0.0. The browser must already be closed by the operator.
    static int MigrateBaseline(string installerFile,string receiptFile,string reportFile) {
      Program.Require(!File.Exists(reportFile),"Migration report exists");
      string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom"),app=Path.Combine(root,"Application"),data=Path.Combine(root,"User Data");
      Call("EnsureNoBrowser",app,0);Call("ReleaseInstallationDirectory");
      Program.Require(!Process.GetProcessesByName("EcomUpdater").Any()&&!Process.GetProcessesByName("EcomUpdateWorker").Any(),"Close update windows before test-baseline migration");
      var receipt=Program.ReadObject(receiptFile);Call("ValidateIdentity",receipt);
      var previous=Program.ReadObject(Path.Combine((string)Call("VersionDirectory",app),"ecom-update.json"));
      Program.Require(Program.S(previous,"version")=="0.0.0"&&Program.S(receipt,"version")=="0.0.0"&&Program.S(previous,"sourceRevision")!=Program.S(receipt,"sourceRevision"),"Only an explicit changed test baseline can migrate");
      Program.Require(Program.Hash(installerFile)==Program.S(receipt,"archiveSha256"),"Baseline installer differs from receipt");
      var before=Snapshot(data);Program.Require(before.Count>0,"No container preservation evidence");
      string evidence=Path.Combine(Program.State,"test-baselines",Guid.NewGuid().ToString("N"));Call("PrivateDirectory",evidence);
      foreach(string name in new[]{"pending.json","rollback.json","last-result.json","channel.json"}) {string file=Path.Combine(Program.State,name);if(File.Exists(file))File.Copy(file,Path.Combine(evidence,name),false);}
      string ready=Path.Combine(Program.State,"ready.json");if(File.Exists(ready))File.Move(ready,Path.Combine(evidence,"ready-before.json"));
      // Hold the repaired baseline on the stable tag until its new candidate is
      // public, so the rejected previous next candidate is not offered again.
      Call("AtomicJson",Path.Combine(Program.State,"channel.json"),new Dictionary<string,object>{{"channel","latest"}});
      string backup=Path.Combine(Program.State,"backups",Guid.NewGuid().ToString("N"));Call("PrivateDirectory",Path.GetDirectoryName(backup));Call("CopyTree",app,backup);
      string native=(string)Call("VersionDirectory",app);
      var record=new Dictionary<string,object>{{"app",app},{"backup",backup},{"version","0.0.0"},{"profile",data},{"exeSha256",Program.Hash(Path.Combine(app,"Ecom.exe"))},{"frameworkSha256",Program.Hash(Path.Combine(native,"chrome.dll"))},{"metadataSha256",Program.Hash(Path.Combine(native,"ecom-update.json"))},{"updaterSha256",Program.Hash(Path.Combine(native,"EcomUpdater.exe"))},{"status","installing"},{"registration",Call("CaptureRegistration")}};
      Call("AtomicJson",Path.Combine(Program.State,"pending.json"),record);
      using(var installer=Process.Start((ProcessStartInfo)Call("UpdateProcess",installerFile,"--do-not-launch-chrome"))) {
        Program.Require(installer.WaitForExit(600000),"Baseline installer still running; preserve pending recovery");Program.Require(installer.ExitCode==0,"Baseline installer failed: "+installer.ExitCode);
      }
      Call("ValidateInstalled",app,receipt);var process=(Process)Call("Restart",app,data,"0.0.0",null);
      var after=Snapshot(data);Program.Require(before.Count==after.Count&&before.All(p=>after.ContainsKey(p.Key)&&Program.Json.Serialize(p.Value)==Program.Json.Serialize(after[p.Key])),"Container identity changed during baseline migration");
      Call("AtomicJson",Path.Combine(Program.State,"rollback.json"),record);record["status"]="complete";Call("AtomicJson",Path.Combine(Program.State,"pending.json"),record);
      Call("TryCleanup","0.0.0",false);
      using(var output=new FileStream(reportFile,FileMode.CreateNew)) {
        byte[] bytes=Encoding.UTF8.GetBytes(Program.Json.Serialize(new Dictionary<string,object>{{"ok",true},{"testOnly",true},{"version","0.0.0"},{"sourceRevision",receipt["sourceRevision"]},{"previousSourceRevision",previous["sourceRevision"]},{"containerIdentitiesPreserved",true},{"profileCount",before.Count},{"pid",process.Id},{"recoveryInputs",evidence}}));output.Write(bytes,0,bytes.Length);
      }
      return 0;
    }
    [STAThread] public static int Main(string[] args) {
      try {
        System.Windows.Forms.Application.EnableVisualStyles();System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
        if(args.Length==4&&args[0]=="--migrate-baseline")return MigrateBaseline(args[1],args[2],args[3]);
        Program.Require((args.Length==4||(args.Length==5&&args[4]=="--keep-candidate"))&&!File.Exists(args[2]),"Supply payload, receipt, a new report path, explicit baseline version and optional --keep-candidate");
        string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom"),app=Path.Combine(root,"Application"),data=Path.Combine(root,"User Data");
        var receipt=Program.ReadObject(args[1]);string version=Program.S(receipt,"version");string baselineVersion=args[3];Program.Require((baselineVersion=="0.0.0"||baselineVersion=="0.1.0"||baselineVersion=="0.1.4")&&new Version(version)>new Version(baselineVersion),"Unsupported explicit baseline or candidate");
        var baseline=Live(app,baselineVersion);var before=Snapshot(data);
        Program.Require(before.Count>0,"No profile preservation evidence");
        string work=Path.Combine(Program.State,"staging",Guid.NewGuid().ToString("N"));Call("PrivateDirectory",work);
        string tgz=Path.Combine(work,"payload.tgz");File.Copy(args[0],tgz,false);Call("VerifyIntegrity",tgz,Program.S(receipt,"integrity"));Call("Extract",tgz,work,false);Call("FetchParts",work,Path.Combine(Path.GetDirectoryName(args[1]),"parts"),null);
        string readyFile=Path.Combine(Program.State,"ready.json");Program.Require(!File.Exists(readyFile),"Preserve the existing deferred update before this isolated local test");
        var metadata=new Dictionary<string,object>{{"version",version}};
        var prepared=(Dictionary<string,object>)Call("PreparedRecord",app,data,work,metadata,receipt["integrity"]);
        Call("SavePreparedRecord",prepared,app,data,baselineVersion);string savedHash=Program.Hash(readyFile);
        var reloaded=(Dictionary<string,object>)Call("ReadPreparedRecord",app,data,baselineVersion);
        Program.Require(Program.S(reloaded,"work")==work&&Program.Hash(readyFile)==savedHash,"Deferred update was not reused unchanged");
        bool wrongContextRejected=false;try{Call("ReadPreparedRecord",app,data+"-different",baselineVersion);}catch(InvalidDataException){wrongContextRejected=true;}Program.Require(wrongContextRejected,"Deferred update crossed a profile boundary");
        File.Delete(readyFile);
        var job=Program.CreateBoundJob(app,data,Convert.ToInt32(baseline["pid"]),Program.S(baseline,"quitEvent"),new Dictionary<string,object>{{"work",work},{"integrity",receipt["integrity"]},{"metadata",metadata}},false);
        Directory.SetCurrentDirectory(Path.Combine(app,FileVersionInfo.GetVersionInfo(Path.Combine(app,"Ecom.exe")).FileVersion));
        string applyEvidence=Path.Combine(Path.GetDirectoryName(args[2]),"apply");Call("PrivateDirectory",applyEvidence);string applyJob=Path.Combine(applyEvidence,"job.json");Call("AtomicJson",applyJob,job);
        Call("RunApplyWithProgress",applyJob);
        var updated=Program.ReadObject(Path.Combine(Program.State,"last-result.json"));Program.Require(Program.S(updated,"status")=="updated"&&Program.S(updated,"sourceRevision")==Program.S(receipt,"sourceRevision"),"Candidate identity mismatch");
        Program.Require(!Directory.Exists(work),"Successful update did not automatically remove its payload");
        string installedCache=Path.Combine((string)Call("VersionDirectory",app),"Installer","chrome.7z");Program.Require(!File.Exists(installedCache),"Differential archive was retained by the installer");
        var rollbackRecord=Program.ReadObject(Path.Combine(Program.State,"rollback.json"));string backup=Program.S(rollbackRecord,"backup");
        Program.Require(!File.Exists(Path.Combine((string)Call("VersionDirectory",backup),"Installer","chrome.7z")),"Rollback backup retained the differential archive");
        Program.Require(File.Exists(Path.Combine((string)Call("VersionDirectory",backup),"Installer","setup.exe")),"Uninstaller was excluded from the rollback backup");
        Thread.Sleep(10000);var live=Live(app,version);var process=Process.GetProcessById(Convert.ToInt32(live["pid"]));process.Refresh();Program.Require(process.MainWindowHandle!=IntPtr.Zero,"Candidate has no ordinary visible window");
        var after=Snapshot(data);Program.Require(before.Count==after.Count&&before.All(p=>after.ContainsKey(p.Key)&&Program.Json.Serialize(p.Value)==Program.Json.Serialize(after[p.Key])),"Container identity changed during update");
        Dictionary<string,object> restored=null,rollbackTiming=null;
        if(args.Length==4) {
          var restore=Program.CreateBoundJob(app,data,Convert.ToInt32(live["pid"]),Program.S(live,"quitEvent"),new Dictionary<string,object>(),true);
          string restoreEvidence=Path.Combine(Path.GetDirectoryName(args[2]),"rollback");Call("PrivateDirectory",restoreEvidence);string restoreJob=Path.Combine(restoreEvidence,"job.json");Call("AtomicJson",restoreJob,restore);Call("RunApplyWithProgress",restoreJob);
          Thread.Sleep(5000);restored=Live(app,baselineVersion);var restoredProfiles=Snapshot(data);Program.Require(before.Count==restoredProfiles.Count&&before.All(p=>restoredProfiles.ContainsKey(p.Key)&&Program.Json.Serialize(p.Value)==Program.Json.Serialize(restoredProfiles[p.Key])),"Container identity changed during rollback");
          rollbackTiming=Program.ReadObject(Path.Combine(restoreEvidence,"timing.json"));
        }
        if(Directory.Exists(work))Directory.Delete(work,true);
        var report=new Dictionary<string,object>{{"ok",true},{"transport","local-payload"},{"fromVersion",baselineVersion},{"testedVersion",version},{"restoredVersion",restored==null?null:baselineVersion},{"finalVersion",restored==null?version:baselineVersion},{"rollbackVerified",restored!=null},{"sourceRevision",receipt["sourceRevision"]},{"candidateVisibleWindow",true},{"containerIdentitiesPreserved",true},{"preparedUpdateReuseVerified",true},{"guiJobPidVerified",true},{"differentialArchiveOmitted",true},{"uninstallerRetained",true},{"installationWindowExercised",true},{"applyTiming",Program.ReadObject(Path.Combine(applyEvidence,"timing.json"))},{"rollbackTiming",rollbackTiming},{"profileCount",before.Count},{"finalPid",(restored??live)["pid"]}};
        using(var stream=new FileStream(args[2],FileMode.CreateNew)){byte[] bytes=Encoding.UTF8.GetBytes(Program.Json.Serialize(report));stream.Write(bytes,0,bytes.Length);}return 0;
      }catch(Exception e){
        try{string report=args.Length>=4?(args[0]=="--migrate-baseline"?args[3]:args[2]):null;if(report!=null)using(var output=new FileStream(report+".error.txt",FileMode.CreateNew)){byte[] bytes=Encoding.UTF8.GetBytes(e.ToString());output.Write(bytes,0,bytes.Length);}}catch{}
        Console.Error.WriteLine(e.ToString());return 1;
      }
    }
  }
}
