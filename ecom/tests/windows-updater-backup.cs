// Verify the exact cache exclusion and intact rollback files on an owned fixture.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
namespace EcomUpdate {
  static class BackupTestMain {
    static void Backup(string source,string destination) {
      try{typeof(Program).GetMethod("BackupApplication",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{source,destination});}
      catch(TargetInvocationException error){throw error.InnerException;}
    }
    static void Write(string file,string content){using(var stream=new StreamWriter(new FileStream(file,FileMode.CreateNew)))stream.Write(content);}
    public static int Main(string[] args) {
      string fixture=null;
      try {
        Program.Require(args.Length==2&&File.Exists(args[0])&&!File.Exists(args[1]),"Supply a real Ecom.exe and a new report path");
        fixture=Path.Combine(Path.GetTempPath(),"EcomBackupTest-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);
        string app=Path.Combine(fixture,"Application"),backup=Path.Combine(fixture,"backup");Directory.CreateDirectory(app);File.Copy(args[0],Path.Combine(app,"Ecom.exe"),false);
        string version=FileVersionInfo.GetVersionInfo(args[0]).FileVersion,native=Path.Combine(app,version),installer=Path.Combine(native,"Installer");Directory.CreateDirectory(installer);
        Write(Path.Combine(installer,"chrome.7z"),"legacy differential cache");Write(Path.Combine(installer,"setup.exe"),"retained uninstaller");Write(Path.Combine(native,"chrome.dll"),"retained framework");Write(Path.Combine(app,"chrome.7z"),"unrelated same-name file");
        var events=new List<InstallProgress>();Program.InstallObserver=events.Add;Backup(app,backup);Program.InstallObserver=null;
        Program.Require(!File.Exists(Path.Combine(backup,version,"Installer","chrome.7z")),"Legacy cache was copied");
        foreach(string relative in new[]{"Ecom.exe",Path.Combine(version,"Installer","setup.exe"),Path.Combine(version,"chrome.dll"),"chrome.7z"})Program.Require(Program.Hash(Path.Combine(app,relative))==Program.Hash(Path.Combine(backup,relative)),"Retained rollback file differs");
        Program.Require(File.Exists(Path.Combine(installer,"chrome.7z")),"Backup changed its source");
        Program.Require(events.Count>1&&events[events.Count-1].Completed==events[events.Count-1].Total,"Verified-byte progress did not complete");
        bool refused=false;try{Backup(app,backup);}catch(InvalidDataException){refused=true;}Program.Require(refused,"Existing backup was overwritten");
        Write(args[1],"{\"ok\":true,\"exactCacheExclusion\":true,\"uninstallerPreserved\":true,\"retainedHashes\":true,\"sourceUnchanged\":true,\"backupProgress\":true,\"existingDestinationRefused\":true}");return 0;
      }catch(Exception error){Console.Error.WriteLine(error.ToString());return 1;}
      finally{Program.InstallObserver=null;if(fixture!=null&&Directory.Exists(fixture))Directory.Delete(fixture,true);}
    }
  }
}
