import os
import shutil
import sys
from pathlib import Path

# UTF-8 출력 보장
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path("E:/coding/VF-new")
HERMES_BASE = Path(os.path.expanduser("~/AppData/Local/hermes"))
HERMES_WIKI = Path("E:/hermes-backup/obsidian/06-Wiki-시스템/Wiki-okf/의사결정")

def sync_wiki():
    """Hermes Wiki-okf/의사결정 -> docs/의사결정 동기화"""
    target_dir = ROOT_DIR / "docs/의사결정"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    if not HERMES_WIKI.exists():
        print(f"  [위키] Hermes Wiki 경로 존재하지 않음: {HERMES_WIKI}")
        return 0
    
    synced_count = 0
    for file in HERMES_WIKI.glob("*.md"):
        dest = target_dir / file.name
        if not dest.exists() or file.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(file, dest)
            synced_count += 1
            print(f"  [위키 동기화] {file.name}")
    return synced_count

def sync_memories():
    """Hermes memories/ -> docs/AGENT_MEMORY*.md 동기화"""
    user_md = HERMES_BASE / "memories/USER.md"
    memory_md = HERMES_BASE / "memories/MEMORY.md"
    
    synced = []
    if user_md.exists():
        dest = ROOT_DIR / "docs/AGENT_MEMORY_USER.md"
        if not dest.exists() or user_md.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(user_md, dest)
            synced.append("AGENT_MEMORY_USER.md")
            
    if memory_md.exists():
        dest = ROOT_DIR / "docs/AGENT_MEMORY.md"
        if not dest.exists() or memory_md.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(memory_md, dest)
            synced.append("AGENT_MEMORY.md")
            
    for name in synced:
        print(f"  [메모리 동기화] {name}")
    return len(synced)

def remove_skill_path(path: Path):
    """디렉토리, 정션, 심볼릭링크 안전하게 제거"""
    if os.path.islink(path) or path.is_symlink():
        os.unlink(path)
    elif path.is_dir():
        try:
            os.rmdir(path)
        except Exception:
            shutil.rmtree(path)
    else:
        path.unlink()

def check_and_clean_duplicate_skills(clean=False):
    """pi global skills 중 Hermes 원본과 중복되는 스킬 확인/정리"""
    pi_skills_dir = Path(os.path.expanduser("~/.pi/agent/skills"))
    hermes_skills_dir = HERMES_BASE / "skills"
    
    if not pi_skills_dir.exists() or not hermes_skills_dir.exists():
        return 0
    
    hermes_skills = set()
    for p in hermes_skills_dir.rglob("SKILL.md"):
        hermes_skills.add(p.parent.name)
        
    cleaned_count = 0
    for child in pi_skills_dir.iterdir():
        if (child.is_dir() or child.is_symlink()) and child.name in hermes_skills:
            if clean:
                remove_skill_path(child)
                print(f"  [스킬 중복 제거] '{child.name}' (Hermes 원본 사용)")
                cleaned_count += 1
            else:
                print(f"  [스킬 중복 감지] '{child.name}' -> Hermes 원본 사용 권장")
    return cleaned_count

def main():
    clean_skills = "--clean-skills" in sys.argv
    print("=== 🔄 Hermes ↔ pi 지식 동기화 시작 ===")
    wiki_count = sync_wiki()
    mem_count = sync_memories()
    skill_clean_count = check_and_clean_duplicate_skills(clean=clean_skills)
    
    msg = f"=== ✅ 동기화 완료: 위키 {wiki_count}건, 메모리 {mem_count}건 최신화"
    if clean_skills:
        msg += f", 중복 스킬 {skill_clean_count}건 정리"
    msg += " ==="
    print(msg)

if __name__ == "__main__":
    main()
