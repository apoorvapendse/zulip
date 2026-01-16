import subprocess

subprocess.run(
    ["./tools/setup/emoji/build_emoji"],
    check=True,
)
subprocess.run(
    ["./tools/setup/build_pygments_data"],
    check=True,
)
subprocess.run(
    ["./tools/setup/build_timezone_values"],
    check=True,
)
subprocess.run(["node", "tools/setup/build_supported_browser_regex.ts"])
subprocess.run(
    ["./tools/webpack", "--config-name=frontend"],
    check=True,
)


# fake a favico icon
subprocess.run(
    ["touch", "static/webpack-bundles/favicon.ico"],
    check=True,
)
print("made fake icon too");

