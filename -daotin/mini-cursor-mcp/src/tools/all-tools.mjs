import "dotenv/config";
import { tool } from "@langchain/core/tools";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { spawn } from "node:child_process";

// 读取文件工具
const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      console.log(
        `  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`,
      );
      return `文件内容:\n${content}`;
    } catch (error) {
      console.error(
        `[工具调用] read_file("${filePath}") - 错误: ${error.message}`,
      );
      return `读取文件失败: ${error.message}`;
    }
  },
  {
    name: "read_file",
    description:
      "用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。",
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径"),
    }),
  },
);

// 写文件工具
const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true }); // 确保目录路径存在
      await fs.writeFile(filePath, content);
      console.log(
        `  [工具调用] write_file("${filePath}") - 成功写入 ${content.length} 字节`,
      );
      return `文件内容:\n${content}`;
    } catch (error) {
      console.error(
        `[工具调用] write_file("${filePath}") - 错误: ${error.message}`,
      );
      return `写入文件失败: ${error.message}`;
    }
  },
  {
    name: "write_file",
    description:
      "用此工具来写入文件内容。当用户要求写入文件、创建文件、修改文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）和文件内容。",
    schema: z.object({
      filePath: z.string().describe("要写入的文件路径"),
      content: z.string().describe("要写入的文件内容"),
    }),
  },
);

// 执行命令工具
const executeCommandTool = tool(
  async ({ command, workingDirectory }) => {
    try {
      const cwd = workingDirectory || process.cwd();
      console.log(
        `[工具调用] execute_command("${command}")${workingDirectory ? `, 工作目录: "${workingDirectory}"` : ""}`,
      );

      return new Promise((resolve, reject) => {
        // 解析命令和参数
        const [cmd, ...args] = command.split(" ");

        const child = spawn(cmd, args, {
          cwd,
          stdio: "inherit", // 实时输出到控制台
          shell: true,
        });

        let errorMsg = "";
        let settled = false;

        // 长期运行命令（dev server 等）5秒内未退出，视为后台启动成功
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            console.log(
              `[工具调用] execute_command("${command}") - 后台服务已启动`,
            );
            resolve(`命令已在后台启动: ${command}`);
          }
        }, 5000);

        child.on("error", (error) => {
          errorMsg = error.message;
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (code === 0) {
            console.log(
              `[工具调用] execute_command("${command}") - 命令执行成功`,
            );
            const cwdInfo = workingDirectory
              ? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用 cd 命令。`
              : "";
            resolve(`命令执行成功: ${command}${cwdInfo}`);
          } else {
            if (errorMsg) {
              console.error(
                `[工具调用] execute_command("${command}") - 错误: ${errorMsg}`,
              );
            }
            reject(new Error(`命令执行失败: ${command} (错误码: ${code})`));
          }
        });
      });
    } catch (error) {
      console.error(
        `[工具调用] execute_command("${command}") - 错误: ${error.message}`,
      );
      return `命令执行失败: ${error.message}`;
    }
  },
  {
    name: "execute_command",
    description:
      "用此工具来执行命令。当用户要求执行命令、查看系统信息、运行脚本时，调用此工具。输入命令（可以是任意命令，如 ls -la）。",
    schema: z.object({
      command: z.string().describe("要执行的命令"),
      workingDirectory: z.string().describe("工作目录").optional(),
    }),
  },
);

// 列出目录工具
const listDirectoryTool = tool(
  async ({ directory }) => {
    try {
      const files = await fs.readdir(directory);
      console.log(
        `[工具调用] list_directory("${directory}") - 找到 ${files.length} 个文件`,
      );
      return `目录内容: ${files.map((file) => `- ${file}`).join("\n")}`;
    } catch (error) {
      console.error(
        `[工具调用] list_directory("${directory}") - 错误: ${error.message}`,
      );
      return `列出目录失败: ${error.message}`;
    }
  },
  {
    name: "list_directory",
  },
  {
    name: "list_directory",
    description:
      "用此工具来列出目录内容。当用户要求列出目录内容、查看文件列表时，调用此工具。输入目录路径（可以是相对路径或绝对路径）。",
    schema: z.object({
      directory: z.string().describe("要列出的目录路径"),
    }),
  },
);

export { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool };
