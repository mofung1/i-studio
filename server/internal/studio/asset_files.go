package studio

func (s *Service) deleteAssetFiles(key string) error {
	if err := s.storage.Delete(key); err != nil {
		return err
	}
	if err := s.storage.Delete(key + ".thumbnail-v1.jpg"); err != nil {
		return err
	}
	if s.db != nil {
		_, err := s.db.Exec("DELETE FROM storage_deletions WHERE storage_key=$1", key)
		return err
	}
	return nil
}
