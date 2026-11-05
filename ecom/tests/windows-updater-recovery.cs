// Live restoration test for the explicitly installed migration baseline only.
// Compile together with EcomUpdater.cs and /main:EcomUpdate.RecoveryTestMain.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
namespace EcomUpdate {
  static class RecoveryTestMain {
    static object Call(string name,params object[] args) {
      try{return typeof(Program).GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,args);}
      catch(TargetInvocationException e){throw e.InnerException;}
    }
    public static int Main(string[] args) {
      string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom");
      string app=Path.Combine(root,"Application"),id=Guid.NewGuid().ToString("N"),test=Path.Combine(Program.State,"recovery-test-"+id);
      try {
        Program.Require(args.Length==1&&!File.Exists(args[0]),"Supply a new report path");
        Program.Require(!Process.GetProcessesByName("Ecom").Any(),"Close Ecom before baseline recovery test");
        string native=Path.Combine(app,FileVersionInfo.GetVersionInfo(Path.Combine(app,"Ecom.exe")).FileVersion);
        var metadata=Program.ReadObject(Path.Combine(native,"ecom-update.json"));
        Program.Require(Program.S(metadata,"version")=="0.0.0","Recovery test requires the migration baseline");
        var profiles=new Dictionary<string,string>();
        string data=Path.Combine(root,"User Data");
        foreach(string file in new[]{Path.Combine(data,"Local State"),Path.Combine(data,"Default","Preferences")})if(File.Exists(file))profiles[file]=Program.Hash(file);
        var registration=(Dictionary<string,object>)Call("CaptureRegistration");
        Call("PrivateDirectory",test);string backup=Path.Combine(test,"Application");Call("CopyTree",app,backup);
        var record=new Dictionary<string,object>{{"app",app},{"backup",backup},{"version","0.0.0"},{"exeSha256",Program.Hash(Path.Combine(app,"Ecom.exe"))},{"frameworkSha256",Program.Hash(Path.Combine(native,"chrome.dll"))},{"metadataSha256",Program.Hash(Path.Combine(native,"ecom-update.json"))},{"updaterSha256",Program.Hash(Path.Combine(native,"EcomUpdater.exe"))},{"registration",registration}};
        Call("AtomicJson",Path.Combine(test,"recovery.json"),record);
        var before=new HashSet<string>(Directory.GetDirectories(root,"Application.failed-*"));
        Call("Restore",record);
        string restored=Path.Combine(app,Path.GetFileName(native));
        foreach(var pair in new[]{Tuple.Create(Path.Combine(app,"Ecom.exe"),"exeSha256"),Tuple.Create(Path.Combine(restored,"chrome.dll"),"frameworkSha256"),Tuple.Create(Path.Combine(restored,"ecom-update.json"),"metadataSha256"),Tuple.Create(Path.Combine(restored,"EcomUpdater.exe"),"updaterSha256")})Program.Require(Program.Hash(pair.Item1)==Program.S(record,pair.Item2),"Restored native hash differs");
        foreach(var profile in profiles)Program.Require(Program.Hash(profile.Key)==profile.Value,"User profile changed during recovery");
        var restoredRegistration=(Dictionary<string,object>)Call("CaptureRegistration");
        Program.Require(restoredRegistration.Count==registration.Count&&registration.All(p=>restoredRegistration.ContainsKey(p.Key)&&Program.Json.Serialize(restoredRegistration[p.Key])==Program.Json.Serialize(p.Value)),"Uninstall registration changed");
        foreach(string created in Directory.GetDirectories(root,"Application.failed-*").Where(p=>!before.Contains(p)))Directory.Delete(created,true);
        Directory.Delete(test,true);
        using(var report=new FileStream(args[0],FileMode.CreateNew)){
          byte[] bytes=Encoding.UTF8.GetBytes(Program.Json.Serialize(new Dictionary<string,object>{{"ok",true},{"restoredVersion","0.0.0"},{"exeAndFrameworkVerified",true},{"updaterAndMetadataVerified",true},{"registrationPreserved",true},{"profileFilesUnchanged",profiles.Count}}));report.Write(bytes,0,bytes.Length);
        }
        return 0;
      }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
    }
  }
}
