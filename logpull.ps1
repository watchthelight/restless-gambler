Param(
    [int]$Lines = 200,
    [string]$Filter = ""
)

# Build remote command
$remote = if ($Filter -ne "") {
    # grep -i, but don't fail when nothing matches
    "bash -lc 'journalctl --user -u casino-bot -n $Lines --no-pager -o short-iso | grep -i -- ""$Filter"" || true'"
}
else {
    "bash -lc 'journalctl --user -u casino-bot -n $Lines --no-pager -o short-iso'"
}

ssh ticketbot $remote
