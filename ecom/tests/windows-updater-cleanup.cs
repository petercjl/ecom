// Isolated filesystem lifecycle tests; no installation or Profile is modified.
using System;
using System.Collections.Generic;
using System.IO;
namespace EcomUpdate {
  static class CleanupTestMain {
    static string Add(string root,string area) {
      string directory=Path.Combine(root,area,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);File.WriteAllText(Path.Combine(directory,"fixture.bin"),"fixture");return directory;
    }
    static void Save(string root,string file,Dictionary<string,object> row){File.WriteAllText(Path.Combine(root,file),Program.Json.Serialize(row));}
    public static int Main() {
      string root=Path.Combine(Path.GetTempPath(),"EcomCleanupTest-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
      try {
        string backup=Add(root,"backups"),obsolete=Add(root,"backups"),ready=Add(root,"staging"),discard=Add(root,"staging"),worker=Add(root,"workers"),oldWorker=Add(root,"workers"),replaced=Add(root,"replaced");
        string profile=Path.Combine(root,"User Data");Directory.CreateDirectory(profile);File.WriteAllText(Path.Combine(profile,"Preferences"),"user data");
        Save(root,"rollback.json",new Dictionary<string,object>{{"backup",backup}});
        Save(root,"ready.json",new Dictionary<string,object>{{"work",ready},{"metadata",new Dictionary<string,object>{{"version","0.1.2"}}}});
        Save(root,"pending.json",new Dictionary<string,object>{{"status","installing"}});
        Program.CleanupState(root,"0.1.1",Path.Combine(worker,"worker.exe"));
        Program.Require(Directory.Exists(discard)&&Directory.Exists(obsolete),"Interrupted installation was cleaned");
        Save(root,"pending.json",new Dictionary<string,object>{{"status","complete"}});
        Program.CleanupState(root,"0.1.1",Path.Combine(worker,"worker.exe"));
        Program.Require(Directory.Exists(backup)&&Directory.Exists(ready)&&Directory.Exists(worker),"Rollback, deferred update or executing worker removed");
        foreach(string stale in new[]{obsolete,discard,oldWorker,replaced})Program.Require(!Directory.Exists(stale),"Obsolete update files retained");
        Program.CleanupState(root,"0.1.2",Path.Combine(worker,"worker.exe"));
        Program.Require(!Directory.Exists(ready)&&!File.Exists(Path.Combine(root,"ready.json")),"Applied payload retained");
        Program.Require(File.ReadAllText(Path.Combine(profile,"Preferences"))=="user data","Profile touched by cleanup");
        Console.WriteLine("Cleanup lifecycle passed: pending recovery, deferred payload, one rollback, current worker and user data.");return 0;
      }catch(Exception e){Console.Error.WriteLine(e);return 1;}finally{Directory.Delete(root,true);}
    }
  }
}
