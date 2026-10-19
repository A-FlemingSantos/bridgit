-- Public links get a friendly alias (slug) plus a short code (suffix), and folders can be published.
-- The code only has to be unique among links sharing the same alias, so the old single-column unique
-- constraint on suffix (unnamed, created inline in V2) is replaced by a (slug, suffix) unique index.
DECLARE @constraint SYSNAME;
SELECT @constraint = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('public_links')
  AND kc.type = 'UQ'
  AND c.name = 'suffix'
  AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = ic.object_id AND x.index_id = ic.index_id) = 1;
IF @constraint IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(400) = N'ALTER TABLE public_links DROP CONSTRAINT ' + QUOTENAME(@constraint);
    EXEC(@sql);
END
GO

-- Codes are compared case-sensitively (legacy codes are mixed-case base62) and aliases exactly as stored.
ALTER TABLE public_links ALTER COLUMN suffix NVARCHAR(32) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE public_links ALTER COLUMN slug NVARCHAR(120) COLLATE Latin1_General_100_BIN2 NOT NULL;
GO

ALTER TABLE public_links ADD kind NVARCHAR(16) NOT NULL
    CONSTRAINT df_public_links_kind DEFAULT 'file'
    CONSTRAINT ck_public_links_kind CHECK (kind IN ('file', 'folder'));
GO

CREATE UNIQUE INDEX ux_public_links_slug_suffix ON public_links (slug, suffix);
GO
