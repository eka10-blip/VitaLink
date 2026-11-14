"""Write a short-lived token to an ignored, owner-only file, never stdout."""
import os
from config import ROOT, room_token, settings


def main() -> None:
    cfg = settings()
    token = room_token(cfg['connector'], cfg['room'])
    directory = ROOT / '.local'
    directory.mkdir(mode=0o700, exist_ok=True)
    path = directory / 'connector-token.txt'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(token)
    print('Wrote .local/connector-token.txt (expires in 30 minutes).')
    print(f"Room: {cfg['room']} | Agent participant identity: {cfg['agent']}")


if __name__ == '__main__':
    main()
