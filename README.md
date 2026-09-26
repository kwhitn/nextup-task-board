# NextUp

A weekly assignment board for tracking due dates, effort, subtasks, and completion.

## Run in Codespaces

1. Resume this Codespace and open the project in VS Code.
2. In the integrated terminal, start the development server:

   ```bash
   npm run dev -- --host 0.0.0.0
   ```

   Run `npm install` first if dependencies have not been installed in this Codespace.
3. In VS Code, open the **Ports** panel and choose **Open in Browser** for port `5173`.

The preview is available only while the Codespace and development server are running. Its forwarded URL is specific to the Codespace.

## Verify changes

```bash
npm run lint
npm run build
```

Tasks are stored in this browser's local storage; they are not synced between browsers or users.
