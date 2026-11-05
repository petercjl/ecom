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
    public static int Main(string[] args) {
      try {
        Program.Require(args.Length==4&&!File.Exists(args[2]),"Supply payload, receipt, a new report path and the explicit baseline version");
        string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ecom"),app=Path.Combine(root,"Application"),data=Path.Combine(root,"User Data");
        var receipt=Program.ReadObject(args[1]);string version=Program.S(receipt,"version");string baselineVersion=args[3];Program.Require((baselineVersion=="0.0.0"||baselineVersion=="0.1.0")&&new Version(version)>new Version(baselineVersion),"Unsupported explicit baseline or candidate");
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
        Call("Apply",job);
        var updated=Program.ReadObject(Path.Combine(Program.State,"last-result.json"));Program.Require(Program.S(updated,"status")=="updated"&&Program.S(updated,"sourceRevision")==Program.S(receipt,"sourceRevision"),"Candidate identity mismatch");
        Thread.Sleep(10000);var live=Live(app,version);var process=Process.GetProcessById(Convert.ToInt32(live["pid"]));process.Refresh();Program.Require(process.MainWindowHandle!=IntPtr.Zero,"Candidate has no ordinary visible window");
        var after=Snapshot(data);Program.Require(before.Count==after.Count&&before.All(p=>after.ContainsKey(p.Key)&&Program.Json.Serialize(p.Value)==Program.Json.Serialize(after[p.Key])),"Container identity changed during update");
        var restore=Program.CreateBoundJob(app,data,Convert.ToInt32(live["pid"]),Program.S(live,"quitEvent"),new Dictionary<string,object>(),true);Call("Apply",restore);
        Thread.Sleep(5000);var restored=Live(app,baselineVersion);var restoredProfiles=Snapshot(data);Program.Require(before.Count==restoredProfiles.Count&&before.All(p=>restoredProfiles.ContainsKey(p.Key)&&Program.Json.Serialize(p.Value)==Program.Json.Serialize(restoredProfiles[p.Key])),"Container identity changed during rollback");
        Directory.Delete(work,true);
        var report=new Dictionary<string,object>{{"ok",true},{"transport","local-payload"},{"fromVersion",baselineVersion},{"testedVersion",version},{"restoredVersion",baselineVersion},{"sourceRevision",receipt["sourceRevision"]},{"candidateVisibleWindow",true},{"containerIdentitiesPreserved",true},{"preparedUpdateReuseVerified",true},{"guiJobPidVerified",true},{"profileCount",before.Count},{"restoredPid",restored["pid"]}};
        using(var stream=new FileStream(args[2],FileMode.CreateNew)){byte[] bytes=Encoding.UTF8.GetBytes(Program.Json.Serialize(report));stream.Write(bytes,0,bytes.Length);}return 0;
      }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}
    }
  }
}
