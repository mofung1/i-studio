package app

import (
	"flag"
	"fmt"
	"os"
	"strings"

	runtimeconfig "github.com/istudio/server/internal/config"
	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/inspiration"
)

// runInspirationSeed 从本地画廊 markdown 导入全量提示词到数据库。
// 用法：go run ./cmd/server seed-inspiration -g1 gallery-part-1.md -g2 gallery-part-2.md -cat gallery.md
func runInspirationSeed(args []string) int {
	flags := flag.NewFlagSet("seed-inspiration", flag.ContinueOnError)
	gallery1 := flags.String("g1", "gallery-part-1.md", "gallery-part-1.md 路径")
	gallery2 := flags.String("g2", "gallery-part-2.md", "gallery-part-2.md 路径")
	categoriesFile := flags.String("cat", "gallery.md", "gallery.md 总览路径（用于分类映射）")
	imageBase := flags.String("images", "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images", "案例图下载基址")
	concurrency := flags.Int("concurrency", 6, "图片下载并发数")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}

	galleryMarkdown, err := readSeedFile(*gallery1, *gallery2)
	if err != nil {
		fmt.Printf("读取画廊文件失败：%v\n", err)
		return 1
	}
	categoriesMarkdown, err := os.ReadFile(*categoriesFile)
	if err != nil {
		fmt.Printf("读取分类总览失败：%v\n", err)
		return 1
	}

	cases, err := inspiration.ParseGallery(galleryMarkdown, string(categoriesMarkdown))
	if err != nil {
		fmt.Printf("解析画廊失败：%v\n", err)
		return 1
	}
	fmt.Printf("解析出 %d 条案例\n", len(cases))

	db, err := database.Open(runtimeconfig.Env("DATABASE_URL", ""))
	if err != nil || db == nil {
		fmt.Printf("数据库不可用：%v（需配置 DATABASE_URL）\n", err)
		return 1
	}
	defer db.Close()
	if err := database.Migrate(db); err != nil {
		fmt.Printf("迁移失败：%v\n", err)
		return 1
	}

	root := runtimeconfig.Env("STORAGE_ROOT", "storage/uploads")
	if err := inspiration.Seed(db, cases, root, *imageBase, *concurrency); err != nil {
		fmt.Printf("导入出错：%v\n", err)
		return 1
	}

	var total int
	_ = db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&total)
	fmt.Printf("导入完成，库内共 %d 条\n", total)
	return 0
}

func readSeedFile(paths ...string) (string, error) {
	var builder strings.Builder
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("%s: %w", path, err)
		}
		builder.Write(data)
		builder.WriteString("\n")
	}
	return builder.String(), nil
}
