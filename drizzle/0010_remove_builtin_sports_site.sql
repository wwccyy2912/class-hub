-- 内置的“运动会资料”站点不再随网站提供：这里把旧版本留下的空站点清理掉。
-- 站点里已经有资料时保留（那是用户自己上传的文件，不能擅自删除）。
DELETE FROM `sites` WHERE `slug` = 'sports' AND NOT EXISTS (SELECT 1 FROM `documents` WHERE `documents`.`site_id` = `sites`.`id`);
