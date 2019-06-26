hostname='sa.adriaan.io
uptime'
echo "'$hostname'"

hostname="${hostname//$'\n'/ }"
echo "'$hostname'"

hostname="${hostname//\\n/ }"
echo "'$hostname'"

ValidHostnameRegex="^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$"
if [[ ! $hostname =~ $ValidHostnameRegex ]] ; then
  echo "bad"
  exit
fi

echo "good"
